// Turns one `getTransaction(…, { encoding: 'jsonParsed' })` result into the
// events that matter to a single wallet. Field names follow the RPC response
// exactly; anything unexpected is skipped rather than guessed.

import { isTokenProgram, SYSTEM_PROGRAM, TOKEN_PROGRAM } from './labels';
import type { NetChange, TxLine, WalletEvent } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

interface TokenAcct {
	owner?: string;
	mint?: string;
	decimals?: number;
	program?: string;
	pre?: string;
	post?: string;
}

function keyOf(k: Json): string {
	return typeof k === 'string' ? k : (k?.pubkey ?? '');
}

/** token account address → owner/mint/decimals, from pre/post token balances. */
function tokenAccounts(tx: Json): Map<string, TokenAcct> {
	const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map(keyOf);
	// Loaded (lookup-table) addresses follow the static keys, writable first.
	const loaded = tx.meta?.loadedAddresses;
	if (loaded) keys.push(...(loaded.writable ?? []), ...(loaded.readonly ?? []));
	const map = new Map<string, TokenAcct>();
	const add = (b: Json, which: 'pre' | 'post') => {
		const addr = keys[b.accountIndex];
		if (!addr) return;
		const cur = map.get(addr) ?? {};
		cur.owner ??= b.owner;
		cur.mint ??= b.mint;
		cur.program ??= b.programId;
		cur.decimals ??= b.uiTokenAmount?.decimals;
		cur[which] = b.uiTokenAmount?.amount ?? '0';
		map.set(addr, cur);
	};
	for (const b of tx.meta?.preTokenBalances ?? []) add(b, 'pre');
	for (const b of tx.meta?.postTokenBalances ?? []) add(b, 'post');
	return map;
}

function allInstructions(tx: Json): Json[] {
	const outer: Json[] = tx.transaction?.message?.instructions ?? [];
	const inner: Json[] = [];
	for (const group of tx.meta?.innerInstructions ?? []) inner.push(...(group.instructions ?? []));
	return [...outer, ...inner];
}

function memoText(ix: Json): string | undefined {
	if (ix.program !== 'spl-memo') return undefined;
	return typeof ix.parsed === 'string' ? ix.parsed : undefined;
}

export function decodeTransaction(tx: Json, wallet: string, signature?: string): TxLine {
	const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map(keyOf);
	const sig: string = signature ?? tx.transaction?.signatures?.[0] ?? '';
	const accts = tokenAccounts(tx);
	const events: WalletEvent[] = [];
	const programs = new Set<string>();

	const ownerOf = (tokenAccount: string | undefined): string | undefined =>
		tokenAccount ? accts.get(tokenAccount)?.owner : undefined;

	for (const ix of allInstructions(tx)) {
		const pid: string = ix.programId ?? '';
		if (pid) programs.add(pid);
		const memo = memoText(ix);
		if (memo !== undefined) {
			events.push({ kind: 'memo', text: memo.slice(0, 280) });
			continue;
		}
		const type: string | undefined = ix.parsed?.type;
		const info: Json = ix.parsed?.info;
		if (!type || !info) continue;

		if (pid === SYSTEM_PROGRAM) {
			if ((type === 'transfer' || type === 'transferWithSeed') && info.lamports !== undefined) {
				const src = info.source ?? info.from;
				const dst = info.destination ?? info.to;
				if (src === wallet && dst !== wallet)
					events.push({ kind: 'sol_out', counterparty: dst, amount: String(info.lamports), decimals: 9 });
				else if (dst === wallet && src !== wallet)
					events.push({ kind: 'sol_in', counterparty: src, amount: String(info.lamports), decimals: 9 });
			} else if ((type === 'assign' || type === 'assignWithSeed') && info.account === wallet) {
				if (info.owner && info.owner !== SYSTEM_PROGRAM) events.push({ kind: 'assign', counterparty: info.owner });
			}
			continue;
		}

		if (!isTokenProgram(pid)) continue;

		if (type === 'transfer' || type === 'transferChecked') {
			const src: string = info.source;
			const dst: string = info.destination;
			const meta = accts.get(src) ?? accts.get(dst);
			const mint: string | undefined = info.mint ?? meta?.mint;
			const decimals: number | undefined = info.tokenAmount?.decimals ?? meta?.decimals;
			const amount: string = info.tokenAmount?.amount ?? info.amount ?? '0';
			const srcOwner = ownerOf(src) ?? info.authority ?? info.multisigAuthority;
			const dstOwner = ownerOf(dst) ?? dst;
			const fromWallet = srcOwner === wallet || info.authority === wallet;
			if (fromWallet && dstOwner !== wallet) {
				events.push({ kind: 'token_out', counterparty: dstOwner, amount, decimals, mint, tokenAccount: src, tokenProgram: pid });
			} else if (dstOwner === wallet && !fromWallet) {
				events.push({ kind: 'token_in', counterparty: srcOwner, amount, decimals, mint, tokenAccount: dst, tokenProgram: pid });
			}
		} else if (type === 'approve' || type === 'approveChecked') {
			if (info.owner === wallet || ownerOf(info.source) === wallet) {
				const meta = accts.get(info.source);
				events.push({
					kind: 'approve',
					counterparty: info.delegate,
					amount: info.tokenAmount?.amount ?? info.amount ?? '0',
					decimals: info.tokenAmount?.decimals ?? meta?.decimals,
					mint: info.mint ?? meta?.mint,
					tokenAccount: info.source,
					tokenProgram: pid
				});
			}
		} else if (type === 'revoke') {
			if (info.owner === wallet || ownerOf(info.source) === wallet)
				events.push({ kind: 'revoke', tokenAccount: info.source, tokenProgram: pid, mint: accts.get(info.source)?.mint });
		} else if (type === 'setAuthority') {
			// Token account authority changes; mint authority changes are not about this wallet.
			const target: string | undefined = info.account;
			if (target && info.authority === wallet) {
				const kind = info.authorityType === 'accountOwner' ? 'owner_change' : info.authorityType === 'closeAccount' ? 'close_authority_change' : undefined;
				if (kind)
					events.push({ kind, counterparty: info.newAuthority ?? undefined, tokenAccount: target, tokenProgram: pid, mint: accts.get(target)?.mint });
			}
		} else if (type === 'closeAccount') {
			if (info.owner === wallet) events.push({ kind: 'close_account', counterparty: info.destination, tokenAccount: info.account, tokenProgram: pid });
		}
	}

	// Fee: only when this wallet is the fee payer (first account key).
	const fee = keys[0] === wallet ? Number(tx.meta?.fee ?? 0) : 0;

	// Interactions with programs we did not decode still deserve a line.
	const meaningful = [...programs].filter((p) => p !== SYSTEM_PROGRAM && p !== TOKEN_PROGRAM && !isTokenProgram(p) && !p.startsWith('ComputeBudget') && !p.startsWith('ATokenGP') && !p.startsWith('Memo'));
	if (events.length === 0 && meaningful.length) events.push({ kind: 'program', counterparty: meaningful[0] });

	// Net change per asset: what actually left or arrived, however many hops it took.
	const net: NetChange[] = [];
	const wi = keys.indexOf(wallet);
	if (wi >= 0) {
		const d = BigInt(tx.meta?.postBalances?.[wi] ?? 0) - BigInt(tx.meta?.preBalances?.[wi] ?? 0) + BigInt(fee);
		if (d !== 0n) net.push({ asset: 'SOL', delta: d.toString(), decimals: 9 });
	}
	const perMint = new Map<string, { d: bigint; decimals: number }>();
	for (const a of accts.values()) {
		if (a.owner !== wallet || !a.mint) continue;
		const cur = perMint.get(a.mint) ?? { d: 0n, decimals: a.decimals ?? 0 };
		cur.d += BigInt(a.post ?? '0') - BigInt(a.pre ?? '0');
		perMint.set(a.mint, cur);
	}
	for (const [mint, v] of perMint) if (v.d !== 0n) net.push({ asset: mint, delta: v.d.toString(), decimals: v.decimals });

	return {
		signature: sig,
		slot: Number(tx.slot ?? 0),
		blockTime: tx.blockTime ?? null,
		failed: tx.meta?.err != null,
		fee,
		events,
		findings: [],
		programs: meaningful,
		net
	};
}

/** Lamports the wallet held before the transaction, when it appears in it. */
export function preLamports(tx: Json, wallet: string): number | undefined {
	const keys: string[] = (tx.transaction?.message?.accountKeys ?? []).map(keyOf);
	const i = keys.indexOf(wallet);
	return i >= 0 ? Number(tx.meta?.preBalances?.[i] ?? 0) : undefined;
}
