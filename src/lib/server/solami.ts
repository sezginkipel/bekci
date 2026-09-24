// Solami webhooks: one webhook carries every actively watched address.
// The webhook id and signing secret live in the `meta` table, created on
// first sync, so the operator only has to set SOLAMI_API_KEY.

/* eslint-disable @typescript-eslint/no-explicit-any */

const API = 'https://api.solami.dev';

export interface SolamiEnv {
	SOLAMI_API_KEY?: string;
	PUBLIC_ORIGIN: string;
	DB: D1Database;
}

async function meta(db: D1Database, k: string): Promise<string | null> {
	const r = await db.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first<{ v: string }>();
	return r?.v ?? null;
}
async function setMeta(db: D1Database, k: string, v: string): Promise<void> {
	await db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(k, v).run();
}

async function api(env: SolamiEnv, path: string, body: unknown): Promise<any> {
	const key = env.SOLAMI_API_KEY!.trim();
	const res = await fetch(`${API}${path}?api_key=${encodeURIComponent(key)}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-api-key': key },
		body: JSON.stringify(body)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`Solami ${path} ${res.status}: ${text.slice(0, 200)}`);
	return text ? JSON.parse(text) : {};
}

export function webhookEnabled(env: SolamiEnv): boolean {
	return Boolean(env.SOLAMI_API_KEY?.trim());
}

/** Point the webhook at exactly the active addresses. Idempotent; called after watch changes and by cron. */
export async function syncWebhook(env: SolamiEnv): Promise<{ id: string; addresses: number } | null> {
	if (!webhookEnabled(env)) return null;
	const rows = await env.DB.prepare("SELECT DISTINCT address FROM watches WHERE status = 'active' ORDER BY address").all<{ address: string }>();
	const addresses = (rows.results ?? []).map((r) => r.address);
	const signature = addresses.join(',');
	if ((await meta(env.DB, 'solami_synced')) === signature && (await meta(env.DB, 'solami_webhook_id'))) {
		return { id: (await meta(env.DB, 'solami_webhook_id'))!, addresses: addresses.length };
	}
	const spec = {
		label: 'bekci-watch',
		url: `${env.PUBLIC_ORIGIN}/api/hooks/solami`,
		stream: false,
		// Solami needs at least one address; the watcher ignores deliveries for unknown ones.
		addresses: addresses.length ? addresses : ['11111111111111111111111111111111'],
		event_types: ['transfer', 'mint', 'burn', 'memo'],
		payload_kind: 'raw',
		transfer_filter: { mints: [], native: true, tokens: true },
		tx_status: { succeeded: true, failed: false },
		enabled: true
	};
	let id = await meta(env.DB, 'solami_webhook_id');
	if (id) {
		await api(env, '/webhooks/update', { id, ...spec });
	} else {
		const created = await api(env, '/webhooks/create', spec);
		const hook = created.webhook ?? created;
		id = String(hook.id);
		await setMeta(env.DB, 'solami_webhook_id', id);
		if (hook.secret) await setMeta(env.DB, 'solami_webhook_secret', String(hook.secret));
	}
	await setMeta(env.DB, 'solami_synced', signature);
	return { id, addresses: addresses.length };
}

function hex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function b64(buf: ArrayBuffer): string {
	let s = '';
	for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
	return btoa(s);
}
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

/** X-Webhook-Signature = HMAC-SHA256(body, secret). Docs do not fix the encoding, so hex and base64 are both accepted. */
export async function verifySignature(db: D1Database, body: string, header: string | null): Promise<boolean> {
	const secret = await meta(db, 'solami_webhook_secret');
	if (!secret || !header) return false;
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
	const given = header.trim().replace(/^sha256=/i, '');
	return safeEqual(given.toLowerCase(), hex(mac)) || safeEqual(given, b64(mac));
}

/** Pull every transaction signature out of a delivery, whatever its envelope looks like. */
export function signaturesIn(payload: unknown): string[] {
	const out = new Set<string>();
	const walk = (v: any, depth: number) => {
		if (depth > 6 || v == null) return;
		if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
		if (typeof v !== 'object') return;
		for (const [k, x] of Object.entries(v)) {
			if ((k === 'signature' || k === 'tx_signature' || k === 'txSignature') && typeof x === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(x)) out.add(x);
			else if (k === 'signatures' && Array.isArray(x) && typeof x[0] === 'string') out.add(x[0]);
			else walk(x, depth + 1);
		}
	};
	walk(payload, 0);
	return [...out];
}
