import { json } from '@sveltejs/kit';
import { makeRpc } from '$lib/chain/rpc';
import type { RequestHandler } from './$types';

// The revoke button builds its transaction in the browser; it only needs a
// recent blockhash, which we fetch here so the page never talks to an RPC directly.
export const GET: RequestHandler = async ({ platform }) => {
	try {
		const r = await makeRpc(platform!.env).call<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
		return json(r.value, { headers: { 'cache-control': 'no-store' } });
	} catch {
		return json({ error: 'rpc' }, { status: 503 });
	}
};
