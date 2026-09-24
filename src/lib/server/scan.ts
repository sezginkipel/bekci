// One wallet scan: recent history + live delegations → Report.

import { decodeTransaction, preLamports } from '../engine/decode';
import { isUnlimited, buildReport } from '../engine/risk';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from '../engine/labels';
import type { Delegation, Report, TxLine } from '../engine/types';
import { pool, type Rpc } from './rpc';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const HISTORY_LIMIT = 40;

export async function fetchTransaction(rpc: Rpc, signature: string): Promise<any | null> {
	return rpc.call('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
}

export async function fetchDelegations(rpc: Rpc, owner: string): Promise<Delegation[]> {
	const out: Delegation[] = [];
	for (const programId of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
		const res: any = await rpc.call('getTokenAccountsByOwner', [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
		for (const acc of res?.value ?? []) {
			const info = acc.account?.data?.parsed?.info;
			if (!info?.delegate) continue;
			const amount: string = info.delegatedAmount?.amount ?? '0';
			const balance: string = info.tokenAmount?.amount ?? '0';
			out.push({
				tokenAccount: acc.pubkey,
				tokenProgram: programId,
				mint: info.mint,
				delegate: info.delegate,
				amount,
				decimals: info.tokenAmount?.decimals ?? info.delegatedAmount?.decimals ?? 0,
				unlimited: isUnlimited(amount, balance) || amount === balance,
				balance
			});
		}
	}
	return out;
}

export async function scanWallet(rpc: Rpc, address: string, limit = HISTORY_LIMIT): Promise<Report> {
	const [sigs, delegations, balance] = await Promise.all([
		rpc.call<any[]>('getSignaturesForAddress', [address, { limit, commitment: 'confirmed' }]),
		// Live permissions are best-effort on public nodes; the report says when they were not checked.
		fetchDelegations(rpc, address).catch(() => null),
		rpc.call<any>('getBalance', [address, { commitment: 'confirmed' }])
	]);
	const pre = new Map<string, number>();
	const txs = await pool(sigs ?? [], 4, async (s: any) => {
		try {
			return await fetchTransaction(rpc, s.signature);
		} catch {
			return null;
		}
	});
	const lines: TxLine[] = [];
	txs.forEach((tx, i) => {
		const sig = sigs[i].signature as string;
		if (!tx) {
			// Keep the line so the log has no silent holes.
			lines.push({ signature: sig, slot: sigs[i].slot ?? 0, blockTime: sigs[i].blockTime ?? null, failed: sigs[i].err != null, fee: 0, events: [], findings: [], programs: [], net: [] });
			return;
		}
		const p = preLamports(tx, address);
		if (p !== undefined) pre.set(sig, p);
		lines.push(decodeTransaction(tx, address, sig));
	});
	return buildReport({
		address,
		lines,
		delegations: delegations ?? [],
		delegationsChecked: delegations !== null,
		preLamports: pre,
		complete: (sigs?.length ?? 0) < limit,
		source: rpc.source,
		lamports: Number(balance?.value ?? 0)
	});
}
