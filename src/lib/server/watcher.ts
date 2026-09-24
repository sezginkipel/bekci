// The watcher: turns new transactions on watched addresses into alert emails.
// Two entry points share one path: Solami webhook deliveries (real time) and
// the minute cron poll (fallback when no Solami key is configured).

import { decodeTransaction, preLamports } from '../engine/decode';
import { applyRules } from '../engine/risk';
import type { Finding, TxLine } from '../engine/types';
import type { Lang } from '../i18n';
import { sendAlert, type MailEnv } from './mail';
import { makeRpc, pool, type RpcEnv } from '../chain/rpc';
import { fetchTransaction, scanWallet } from '../chain/scan';
import { syncWebhook, webhookEnabled, type SolamiEnv } from './solami';

export type WatchEnv = MailEnv & RpcEnv & SolamiEnv & { DB: D1Database };

const MAX_COUNTERPARTIES = 300;
const POLL_BATCH = 20;

interface Cursor {
	address: string;
	last_signature: string | null;
	counterparties: string;
}

async function cursor(db: D1Database, address: string): Promise<Cursor | null> {
	return db.prepare('SELECT address, last_signature, counterparties FROM cursors WHERE address = ?').bind(address).first<Cursor>();
}

/** First sight of an address: learn who it pays and where history ends, without alerting on the past. */
export async function seedCursor(env: WatchEnv, address: string): Promise<void> {
	if (await cursor(env.DB, address)) return;
	const report = await scanWallet(makeRpc(env), address);
	await env.DB.prepare('INSERT OR IGNORE INTO cursors (address, last_signature, counterparties, checked_at) VALUES (?, ?, ?, ?)')
		.bind(address, report.lines[0]?.signature ?? null, JSON.stringify(report.counterparties.slice(-MAX_COUNTERPARTIES)), Date.now())
		.run();
}

/** Decode + rule-check `txs` (newest first) for one address, email active watchers, advance the cursor. */
async function handle(env: WatchEnv, address: string, txs: { signature: string; tx: unknown }[], via: 'poll' | 'webhook'): Promise<number> {
	const cur = await cursor(env.DB, address);
	const known: string[] = cur ? JSON.parse(cur.counterparties) : [];
	const pre = new Map<string, number>();
	const lines: TxLine[] = [];
	for (const { signature, tx } of txs) {
		if (!tx) continue;
		const p = preLamports(tx, address);
		if (p !== undefined) pre.set(signature, p);
		lines.push(decodeTransaction(tx, address, signature));
	}
	const { counterparties } = applyRules(lines, { preLamports: pre, known });

	const watchers = await env.DB.prepare("SELECT id, email, address, token, lang FROM watches WHERE address = ? AND status = 'active'")
		.bind(address)
		.all<{ id: string; email: string; address: string; token: string; lang: Lang }>();
	let sent = 0;
	for (const line of [...lines].reverse()) {
		const worth: Finding[] = line.findings.filter((f) => f.severity === 'danger' || f.severity === 'warn');
		if (!worth.length) continue;
		// Record first; the UNIQUE key makes webhook retries and poll overlap harmless.
		const fresh: Finding[] = [];
		for (const f of worth) {
			const r = await env.DB.prepare('INSERT OR IGNORE INTO alerts (address, signature, kind, severity, subject, via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
				.bind(address, line.signature, f.kind, f.severity, f.subject ?? null, via, Date.now())
				.run();
			if (r.meta.changes) fresh.push(f);
		}
		if (!fresh.length) continue;
		for (const w of watchers.results ?? []) if (await sendAlert(env, w, line, fresh)) sent++;
	}

	// Never move the cursor past a transaction we could not read; the next tick
	// re-reads the batch and the alerts table keeps it from emailing twice.
	const newest = txs.some((x) => !x.tx) ? undefined : txs[0]?.signature;
	await env.DB.prepare(
		`INSERT INTO cursors (address, last_signature, counterparties, checked_at) VALUES (?1, ?2, ?3, ?4)
		 ON CONFLICT (address) DO UPDATE SET last_signature = COALESCE(?2, last_signature), counterparties = ?3, checked_at = ?4`
	)
		.bind(address, via === 'poll' ? (newest ?? null) : (cur?.last_signature ?? null), JSON.stringify([...counterparties].slice(-MAX_COUNTERPARTIES)), Date.now())
		.run();
	return sent;
}

/** Cron fallback: read what is new since the cursor for the least recently checked addresses. */
export async function pollOnce(env: WatchEnv): Promise<{ addresses: number; txs: number; alerts: number }> {
	const rpc = makeRpc(env);
	const rows = await env.DB.prepare(
		`SELECT DISTINCT w.address FROM watches w LEFT JOIN cursors c ON c.address = w.address
		 WHERE w.status = 'active' ORDER BY COALESCE(c.checked_at, 0) ASC LIMIT ?`
	)
		.bind(POLL_BATCH)
		.all<{ address: string }>();
	let txCount = 0;
	let alerts = 0;
	for (const { address } of rows.results ?? []) {
		try {
			const cur = await cursor(env.DB, address);
			if (!cur) {
				await seedCursor(env, address);
				continue;
			}
			const sigs = await rpc.call<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [
				address,
				{ limit: 25, commitment: 'confirmed', ...(cur.last_signature ? { until: cur.last_signature } : {}) }
			]);
			if (!sigs?.length) {
				await env.DB.prepare('UPDATE cursors SET checked_at = ? WHERE address = ?').bind(Date.now(), address).run();
				continue;
			}
			const txs = await pool(sigs, 3, async (s) => ({ signature: s.signature, tx: await fetchTransaction(rpc, s.signature).catch(() => null) }));
			txCount += txs.length;
			alerts += await handle(env, address, txs, 'poll');
		} catch (e) {
			console.log('poll failed', address, (e as Error).message);
		}
	}
	return { addresses: rows.results?.length ?? 0, txs: txCount, alerts };
}

/** Webhook path: fetch each delivered signature once and run it for every watched address it touches. */
export async function handleDelivery(env: WatchEnv, signatures: string[]): Promise<{ txs: number; alerts: number }> {
	const rpc = makeRpc(env);
	const active = await env.DB.prepare("SELECT DISTINCT address FROM watches WHERE status = 'active'").all<{ address: string }>();
	const watched = new Set((active.results ?? []).map((r) => r.address));
	let alerts = 0;
	const fetched = await pool(signatures.slice(0, 20), 3, async (signature) => ({ signature, tx: await fetchTransaction(rpc, signature).catch(() => null) }));
	for (const item of fetched) {
		if (!item.tx) continue;
		const keys: string[] = ((item.tx as { transaction?: { message?: { accountKeys?: ({ pubkey: string } | string)[] } } }).transaction?.message?.accountKeys ?? []).map((k) =>
			typeof k === 'string' ? k : k.pubkey
		);
		// Token transfers name token accounts, so also check owners in the balance lists.
		const owners: string[] = [
			...(((item.tx as { meta?: { preTokenBalances?: { owner?: string }[] } }).meta?.preTokenBalances ?? []).map((b) => b.owner ?? '')),
			...(((item.tx as { meta?: { postTokenBalances?: { owner?: string }[] } }).meta?.postTokenBalances ?? []).map((b) => b.owner ?? ''))
		];
		for (const addr of new Set([...keys, ...owners])) if (watched.has(addr)) alerts += await handle(env, addr, [item], 'webhook');
	}
	return { txs: fetched.length, alerts };
}

export async function cronTick(env: WatchEnv): Promise<unknown> {
	if (webhookEnabled(env)) {
		// Real time comes from the webhook; cron only keeps its address list in sync
		// and still polls, cheaply, so a missed delivery is caught within minutes.
		const synced = await syncWebhook(env).catch((e) => ({ error: (e as Error).message }));
		const polled = await pollOnce(env);
		return { mode: 'webhook', synced, polled };
	}
	return { mode: 'poll', polled: await pollOnce(env) };
}
