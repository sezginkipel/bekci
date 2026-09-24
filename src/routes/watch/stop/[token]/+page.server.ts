import { syncWebhook } from '$lib/server/solami';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const env = platform!.env;
	setHeaders({ 'cache-control': 'no-store' });
	const w = await env.DB.prepare('SELECT id, address, status FROM watches WHERE token = ?').bind(params.token).first<{ id: string; address: string; status: string }>();
	if (!w) return { ok: false as const };
	if (w.status !== 'stopped') {
		await env.DB.prepare("UPDATE watches SET status = 'stopped', stopped_at = ? WHERE id = ?").bind(Date.now(), w.id).run();
		platform!.ctx.waitUntil(syncWebhook(env).catch((e) => console.log('solami sync', (e as Error).message)));
	}
	return { ok: true as const, address: w.address };
};
