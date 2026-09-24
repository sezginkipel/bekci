import { fail } from '@sveltejs/kit';
import { seedCursor } from '$lib/server/watcher';
import { syncWebhook } from '$lib/server/solami';
import type { Actions, PageServerLoad } from './$types';

type Row = { id: string; address: string; email: string; status: string };

async function find(db: D1Database, token: string): Promise<Row | null> {
	return db.prepare('SELECT id, address, email, status FROM watches WHERE token = ?').bind(token).first<Row>();
}

// The GET only shows the page. Mail scanners open links on their own, so the
// watch starts on the button press (POST), which keeps the opt-in a real one.
export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });
	const w = await find(platform!.env.DB, params.token);
	if (!w || w.status === 'stopped') return { state: 'bad' as const };
	return { state: w.status === 'active' ? ('active' as const) : ('pending' as const), address: w.address, email: w.email };
};

export const actions: Actions = {
	default: async ({ params, platform }) => {
		const env = platform!.env;
		const w = await find(env.DB, params.token);
		if (!w || w.status === 'stopped') return fail(400, { bad: true });
		if (w.status === 'pending') {
			await env.DB.prepare("UPDATE watches SET status = 'active', confirmed_at = ? WHERE id = ?").bind(Date.now(), w.id).run();
			// Learn the wallet's history before the first alert so old events do not fire.
			try {
				await seedCursor(env, w.address);
			} catch (e) {
				console.log('seed failed; poll will retry', (e as Error).message);
			}
			platform!.ctx.waitUntil(syncWebhook(env).catch((e) => console.log('solami sync', (e as Error).message)));
		}
		return { started: true };
	}
};
