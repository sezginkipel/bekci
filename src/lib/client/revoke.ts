// Revoke a token delegate from the user's own wallet. The transaction is built
// here and signed in the wallet; Bekçi never sees a key. Token program
// instruction 5 = Revoke, accounts: [token account (writable), owner (signer)].

/* eslint-disable @typescript-eslint/no-explicit-any */

import { makeRpc } from '$lib/chain/rpc';

export type RevokeResult =
	| { ok: true; signature: string }
	| { ok: false; code: 'nowallet' }
	| { ok: false; code: 'wrong'; connected: string }
	| { ok: false; code: 'failed'; reason: string };

function provider(): any {
	const w = window as any;
	return w.phantom?.solana ?? w.solflare ?? w.backpack ?? w.solana ?? null;
}

export async function revokeDelegate(opts: { owner: string; tokenAccount: string; tokenProgram: string }): Promise<RevokeResult> {
	const p = provider();
	if (!p) return { ok: false, code: 'nowallet' };
	try {
		const res = await p.connect();
		const connected = String(res?.publicKey ?? p.publicKey ?? '');
		if (connected !== opts.owner) return { ok: false, code: 'wrong', connected };

		const [{ Transaction, TransactionInstruction, PublicKey }, bh] = await Promise.all([
			import('@solana/web3.js'),
			fetch('/api/blockhash')
				.then((r) => {
					if (!r.ok) throw new Error('blockhash unavailable');
					return r.json() as Promise<{ blockhash: string; lastValidBlockHeight: number }>;
				})
				// Server refused by the node: ask a public RPC from the browser instead.
				.catch(async () => (await makeRpc({}).call<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }])).value)
		]);
		const owner = new PublicKey(opts.owner);
		const tx = new Transaction({ feePayer: owner, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
		tx.add(
			new TransactionInstruction({
				programId: new PublicKey(opts.tokenProgram),
				keys: [
					{ pubkey: new PublicKey(opts.tokenAccount), isSigner: false, isWritable: true },
					{ pubkey: owner, isSigner: true, isWritable: false }
				],
				data: new Uint8Array([5]) as any
			})
		);
		const out = await p.signAndSendTransaction(tx);
		return { ok: true, signature: String(out?.signature ?? out) };
	} catch (e) {
		const err = e as { message?: string; code?: number };
		return { ok: false, code: 'failed', reason: err.message ?? String(e) };
	}
}
