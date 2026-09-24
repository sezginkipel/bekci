import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import { decodeTransaction } from './decode';
import { applyRules, buildReport, checkDestination } from './risk';
import { edgeMatch, isLookalike } from './address';
import { PROGRAMS, TOKENS, SYSTEM_PROGRAM, TOKEN_PROGRAM } from './labels';
import payout from './fixtures/usdc-payout-memo.json';
import batch from './fixtures/sol-batch.json';
import type { TxLine } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ME = 'F7p3dFrjRTbtRp8FRF6qHLomXbKRBzpvBLjtQcfcgmNe';
const FRIEND = 'AToQs1QeJCwENSnHJUHUp9xNWYabqYkwhjaK9jWmToK2';
// Same first 4 and last 4 characters as FRIEND, different middle: a ground poisoner.
const POISON = 'AToQzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzToK2';
const MY_ATA = 'Q4UmPB9hKMw3ERqksavS9oEpNo2eWG4ffkWg7wHa9j6';
const DRAINER = 'DRa1nerDRa1nerDRa1nerDRa1nerDRa1nerDRa1ner1';

let slot = 1000;
/** Build a transaction in the exact jsonParsed shape the RPC returns (see fixtures/). */
function tx(opts: { keys: string[]; ixs: any[]; inner?: any[]; pre?: number[]; post?: number[]; tokenPre?: any[]; tokenPost?: any[]; err?: any; fee?: number }) {
	slot++;
	return {
		slot,
		blockTime: 1_790_000_000 + slot,
		transaction: {
			signatures: [`sig${slot}`],
			message: {
				accountKeys: opts.keys.map((pubkey, i) => ({ pubkey, signer: i === 0, writable: true, source: 'transaction' })),
				instructions: opts.ixs
			}
		},
		meta: {
			err: opts.err ?? null,
			fee: opts.fee ?? 5000,
			preBalances: opts.pre ?? opts.keys.map(() => 0),
			postBalances: opts.post ?? opts.keys.map(() => 0),
			preTokenBalances: opts.tokenPre ?? [],
			postTokenBalances: opts.tokenPost ?? [],
			innerInstructions: opts.inner ? [{ index: 0, instructions: opts.inner }] : []
		}
	};
}
const solTransfer = (source: string, destination: string, lamports: number) => ({
	program: 'system',
	programId: SYSTEM_PROGRAM,
	parsed: { type: 'transfer', info: { source, destination, lamports } }
});
const tokenBal = (accountIndex: number, owner: string, amount: string) => ({
	accountIndex,
	mint: USDC,
	owner,
	programId: TOKEN_PROGRAM,
	uiTokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6, uiAmountString: String(Number(amount) / 1e6) }
});

describe('labels', () => {
	it('every labelled address is a real 32-byte base58 key', () => {
		for (const a of [...Object.keys(PROGRAMS), ...Object.keys(TOKENS)]) expect(bs58.decode(a).length, a).toBe(32);
	});
});

describe('address', () => {
	it('measures shared edges', () => {
		expect(edgeMatch(FRIEND, POISON)).toEqual({ prefix: 4, suffix: 4 });
	});
	it('flags lookalikes, never the same address', () => {
		expect(isLookalike(FRIEND, POISON)).toBe(true);
		expect(isLookalike(FRIEND, FRIEND)).toBe(false);
		expect(isLookalike(FRIEND, ME)).toBe(false);
	});
});

describe('decode: real mainnet fixtures', () => {
	it('reads a USDC payout with memo (spl-token transfer, owner from token balances)', () => {
		const line = decodeTransaction(payout.tx, payout.wallet);
		const out = line.events.find((e) => e.kind === 'token_out');
		expect(out).toMatchObject({ counterparty: FRIEND, amount: '1024146', mint: USDC, decimals: 6, tokenAccount: MY_ATA });
		expect(line.events.filter((e) => e.kind === 'memo').length).toBe(2);
		// Only System/Token/ATA/Memo/ComputeBudget: a plain transfer.
		expect(line.programs).toEqual([]);
		expect(line.net.find((n) => n.asset === USDC)?.delta).toBe('-1024146');
	});
	it('reads a batch of native SOL transfers', () => {
		const line = decodeTransaction(batch.tx, batch.wallet);
		expect(line.events.length).toBeGreaterThan(1);
		expect(line.events.every((e) => e.kind === 'sol_out' && e.decimals === 9)).toBe(true);
	});
});

describe('rules', () => {
	const pay = decodeTransaction(payout.tx, payout.wallet); // ME → FRIEND (USDC)

	it('flags a lookalike dust transfer as poisoning, and the later send to it', () => {
		const dust = decodeTransaction(tx({ keys: [POISON, ME, SYSTEM_PROGRAM], ixs: [solTransfer(POISON, ME, 1)] }), ME);
		const mistake = decodeTransaction(tx({ keys: [ME, POISON, SYSTEM_PROGRAM], ixs: [solTransfer(ME, POISON, 2_000_000_000)], pre: [3_000_000_000, 0, 0] }), ME);
		const lines: TxLine[] = [mistake, dust, pay]; // newest first
		const { poisoners, counterparties } = applyRules(lines, { preLamports: new Map([[mistake.signature, 3_000_000_000]]) });
		expect([...poisoners]).toEqual([POISON]);
		expect(counterparties.has(FRIEND)).toBe(true);
		expect(counterparties.has(POISON)).toBe(false);
		expect(dust.findings[0]).toMatchObject({ kind: 'poisoning', severity: 'danger', subject: POISON, imitates: FRIEND });
		expect(mistake.findings.map((f) => f.kind)).toEqual(['sent_to_lookalike', 'large_outflow']);
	});

	it('does not call a normal stranger payment poisoning; tiny ones are dust (info)', () => {
		const stranger = 'Str4ngerStr4ngerStr4ngerStr4ngerStr4ngerX9';
		const small = decodeTransaction(tx({ keys: [stranger, ME, SYSTEM_PROGRAM], ixs: [solTransfer(stranger, ME, 5000)] }), ME);
		const big = decodeTransaction(tx({ keys: [stranger, ME, SYSTEM_PROGRAM], ixs: [solTransfer(stranger, ME, 5_000_000_000)] }), ME);
		applyRules([big, small, pay]);
		expect(small.findings.map((f) => f.kind)).toEqual(['dust']);
		expect(big.findings).toEqual([]);
	});

	it('learns counterparties only from plain transfers, not swaps', () => {
		const pool = 'Poo1Poo1Poo1Poo1Poo1Poo1Poo1Poo1Poo1Poo1Poo1';
		const swap = decodeTransaction(
			tx({ keys: [ME, pool, SYSTEM_PROGRAM, 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'], ixs: [{ programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', accounts: [], data: '' }], inner: [solTransfer(ME, pool, 1_000_000)] }),
			ME
		);
		expect(swap.programs).toEqual(['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4']);
		const { counterparties } = applyRules([swap]);
		expect(counterparties.has(pool)).toBe(false);
	});

	it('flags an unlimited token approval as danger, a bounded one as warn', () => {
		const approve = (amount: string) =>
			decodeTransaction(
				tx({
					keys: [ME, MY_ATA, TOKEN_PROGRAM],
					ixs: [{ program: 'spl-token', programId: TOKEN_PROGRAM, parsed: { type: 'approve', info: { source: MY_ATA, delegate: DRAINER, owner: ME, amount } } }],
					tokenPre: [tokenBal(1, ME, '5000000')],
					tokenPost: [tokenBal(1, ME, '5000000')]
				}),
				ME
			);
		const unlimited = approve('18446744073709551615');
		const bounded = approve('1000000');
		applyRules([unlimited, bounded]);
		expect(unlimited.findings[0]).toMatchObject({ kind: 'delegate_granted', severity: 'danger', subject: DRAINER, mint: USDC, tokenAccount: MY_ATA, tokenProgram: TOKEN_PROGRAM });
		expect(bounded.findings[0]).toMatchObject({ kind: 'delegate_granted', severity: 'warn' });
	});

	it('flags token account owner change and wallet re-assignment (drainer patterns)', () => {
		const setOwner = decodeTransaction(
			tx({
				keys: [ME, MY_ATA, TOKEN_PROGRAM],
				ixs: [{ program: 'spl-token', programId: TOKEN_PROGRAM, parsed: { type: 'setAuthority', info: { account: MY_ATA, authority: ME, authorityType: 'accountOwner', newAuthority: DRAINER } } }],
				tokenPre: [tokenBal(1, ME, '5000000')],
				tokenPost: [tokenBal(1, DRAINER, '5000000')]
			}),
			ME
		);
		const assign = decodeTransaction(tx({ keys: [ME, SYSTEM_PROGRAM], ixs: [{ program: 'system', programId: SYSTEM_PROGRAM, parsed: { type: 'assign', info: { account: ME, owner: DRAINER } } }] }), ME);
		applyRules([assign, setOwner]);
		expect(setOwner.findings[0]).toMatchObject({ kind: 'owner_changed', severity: 'danger', subject: DRAINER });
		expect(assign.findings[0]).toMatchObject({ kind: 'wallet_assigned', severity: 'danger', subject: DRAINER });
	});

	it('flags a URL memo only when a stranger sent something', () => {
		const stranger = 'Str4ngerStr4ngerStr4ngerStr4ngerStr4ngerX9';
		const memo = { program: 'spl-memo', programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr', parsed: 'Claim your reward at solana-gift.claim now' };
		const bait = decodeTransaction(tx({ keys: [stranger, ME, SYSTEM_PROGRAM], ixs: [solTransfer(stranger, ME, 1), memo] }), ME);
		applyRules([bait]);
		expect(bait.findings.map((f) => f.kind)).toContain('phishing_memo');
		const mine = decodeTransaction(payout.tx, payout.wallet);
		applyRules([mine]);
		expect(mine.findings).toEqual([]);
	});

	it('ignores failed transactions for transfers', () => {
		const dust = decodeTransaction(tx({ keys: [POISON, ME, SYSTEM_PROGRAM], ixs: [solTransfer(POISON, ME, 1)], err: { InstructionError: [0, 'Custom'] } }), ME);
		applyRules([dust, decodeTransaction(payout.tx, payout.wallet)]);
		expect(dust.failed).toBe(true);
		expect(dust.findings).toEqual([]);
	});
});

describe('report + send check', () => {
	it('verdict follows the worst finding and live delegations', () => {
		const pay = decodeTransaction(payout.tx, payout.wallet);
		const clean = buildReport({ address: ME, lines: [pay], delegations: [], complete: true, source: 'fallback', lamports: 1 });
		expect(clean.verdict).toBe('ok');
		const risky = buildReport({
			address: ME,
			lines: [decodeTransaction(payout.tx, payout.wallet)],
			delegations: [{ tokenAccount: MY_ATA, tokenProgram: TOKEN_PROGRAM, mint: USDC, delegate: DRAINER, amount: '18446744073709551615', decimals: 6, unlimited: true, balance: '1' }],
			complete: true,
			source: 'fallback',
			lamports: 1
		});
		expect(risky.verdict).toBe('danger');
		expect(risky.counts.danger).toBe(1);
	});

	it('knows a real recipient, catches its lookalike, and names a poisoner', () => {
		const pay = decodeTransaction(payout.tx, payout.wallet);
		const dust = decodeTransaction(tx({ keys: [POISON, ME, SYSTEM_PROGRAM], ixs: [solTransfer(POISON, ME, 1)] }), ME);
		const report = buildReport({ address: ME, lines: [dust, pay], delegations: [], complete: true, source: 'fallback', lamports: 1 });
		expect(checkDestination(report, FRIEND)).toMatchObject({ verdict: 'known', times: 1 });
		expect(checkDestination(report, POISON)).toMatchObject({ verdict: 'poisoner', imitates: FRIEND });
		const other = 'AToQyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyToK2';
		expect(checkDestination(report, other)).toMatchObject({ verdict: 'lookalike', imitates: FRIEND });
		expect(checkDestination(report, DRAINER)).toEqual({ verdict: 'new' });
		expect(checkDestination(report, ME)).toEqual({ verdict: 'self' });
	});
});
