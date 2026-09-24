import { error, fail } from '@sveltejs/kit';
import { isAddressShape } from '$lib/engine/address';
import type { Report } from '$lib/engine/types';
import { t } from '$lib/i18n';
import { sendConfirm } from '$lib/server/mail';
import { makeRpc } from '$lib/chain/rpc';
import { scanWallet } from '$lib/chain/scan';
import { webhookEnabled } from '$lib/server/solami';
import type { Actions, PageServerLoad } from './$types';

const CACHE_SECONDS = 60;
const MAX_WATCHES_PER_EMAIL = 5;
const MAX_NEW_PER_IP_HOUR = 10;

export const load: PageServerLoad = async ({ params, platform, locals, url, setHeaders }) => {
	const address = params.address;
	if (!isAddressShape(address)) error(404, t(locals.lang, 'err.notfound'));
	const env = platform!.env;
	setHeaders({ 'cache-control': 'private, no-store' });

	// Public nodes refuse Cloudflare's shared egress (measured 2026-09-24: HTTP 403),
	// so without the Solami line the browser reads the chain itself with the same engine.
	if (!webhookEnabled(env)) return { report: null, clientScan: true, realtime: false };

	// Cache API, not KV: request-keyed KV writes are a quota hazard, the edge cache is free.
	// Typed locally: DOM and workers-types disagree on Response, the runtime does not.
	const cache = platform?.caches?.default as unknown as { match(k: string): Promise<Response | undefined>; put(k: string, r: Response): Promise<void> } | undefined;
	const key = `https://cache.bekci.internal/report/${address}`;
	let report: Report | null = null;
	if (cache && !url.searchParams.has('fresh')) {
		const hit = await cache.match(key);
		if (hit) report = (await hit.json()) as Report;
	}
	if (!report) {
		try {
			report = await scanWallet(makeRpc(env), address);
		} catch (e) {
			console.log('scan failed', address, (e as Error).message);
			error(503, t(locals.lang, 'err.rpc'));
		}
		if (cache)
			platform!.ctx.waitUntil(
				cache.put(key, new Response(JSON.stringify(report), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SECONDS}` } }))
			);
	}
	return { report, clientScan: false, realtime: webhookEnabled(env) };
};

async function sha256(s: string): Promise<string> {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function token(): string {
	const b = new Uint8Array(24);
	crypto.getRandomValues(b);
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const actions: Actions = {
	watch: async ({ request, params, platform, locals, getClientAddress }) => {
		const env = platform!.env;
		const L = locals.lang;
		const address = params.address;
		if (!isAddressShape(address)) return fail(400, { watchError: t(L, 'send.bad') });
		// Without the Solami line the server cannot read the chain reliably, so it must not promise alerts.
		if (!webhookEnabled(env)) return fail(503, { watchError: t(L, 'keep.soon') });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return fail(400, { email, watchError: t(L, 'keep.bademail') });

		const now = Date.now();
		const ipHash = await sha256(`${env.IP_SALT ?? 'bekci'}:${getClientAddress()}`);
		const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM watches WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 3_600_000).first<{ n: number }>();
		if ((recent?.n ?? 0) >= MAX_NEW_PER_IP_HOUR) return fail(429, { email, watchError: t(L, 'keep.slow') });

		const existing = await env.DB.prepare('SELECT id, status FROM watches WHERE address = ? AND email = ?').bind(address, email).first<{ id: string; status: string }>();
		if (existing?.status === 'active') return fail(400, { email, watchError: t(L, 'keep.already') });

		const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM watches WHERE email = ? AND status IN ('active', 'pending') AND address != ?")
			.bind(email, address)
			.first<{ n: number }>();
		if ((count?.n ?? 0) >= MAX_WATCHES_PER_EMAIL) return fail(400, { email, watchError: t(L, 'keep.limit') });

		const id = existing?.id ?? crypto.randomUUID();
		const tok = token();
		if (existing) {
			await env.DB.prepare("UPDATE watches SET status = 'pending', token = ?, lang = ?, ip_hash = ?, created_at = ?, stopped_at = NULL WHERE id = ?")
				.bind(tok, L, ipHash, now, id)
				.run();
		} else {
			await env.DB.prepare('INSERT INTO watches (id, address, email, lang, status, token, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(id, address, email, L, 'pending', tok, ipHash, now)
				.run();
		}
		const ok = await sendConfirm(env, { id, email, address, token: tok, lang: L });
		if (!ok) return fail(502, { email, watchError: t(L, 'keep.mailfail') });
		return { sent: true, email };
	}
};
