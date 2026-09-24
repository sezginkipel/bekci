import { json } from '@sveltejs/kit';
import { signaturesIn, verifySignature } from '$lib/server/solami';
import { handleDelivery } from '$lib/server/watcher';
import type { RequestHandler } from './$types';

// Solami delivery endpoint. Signed with the webhook secret; unsigned or badly
// signed bodies are refused before anything touches the database or the RPC.
export const POST: RequestHandler = async ({ request, platform }) => {
	const env = platform!.env;
	const body = await request.text();
	if (body.length > 1_000_000) return json({ error: 'too large' }, { status: 413 });
	if (!(await verifySignature(env.DB, body, request.headers.get('x-webhook-signature')))) {
		return json({ error: 'bad signature' }, { status: 401 });
	}
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: 'bad json' }, { status: 400 });
	}
	const sigs = signaturesIn(payload);
	// Answer fast; Solami retries on slow endpoints. The work continues after the response.
	platform!.ctx.waitUntil(handleDelivery(env, sigs).then((r) => console.log('delivery', JSON.stringify(r))).catch((e) => console.log('delivery failed', (e as Error).message)));
	return json({ ok: true, signatures: sigs.length });
};
