// Risk rules. Every rule reads decoded events only, so it can be tested
// without a network and runs the same on the report page and in the watcher.

import { findImitated, isLookalike } from './address';
import type { Delegation, Finding, Report, Severity, TxLine } from './types';

/** Below this, an incoming SOL transfer from a stranger is "dust". */
export const DUST_LAMPORTS = 10_000n; // 0.00001 SOL
/** Outgoing SOL above this share of the balance is worth a second look. */
export const LARGE_OUTFLOW_PCT = 50;
/** u64 max / 2: treat delegations at or above this as unlimited. */
const UNLIMITED = 2n ** 63n;

const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|io|xyz|app|net|org|site|online|fun|gift|claim|live|top)\b)/i;

function big(s: string | undefined): bigint {
	try {
		return BigInt(s ?? '0');
	} catch {
		return 0n;
	}
}

export function isUnlimited(amount: string, balance?: string): boolean {
	const a = big(amount);
	if (a >= UNLIMITED) return true;
	return balance !== undefined && big(balance) > 0n && a >= big(balance) * 1000n;
}

/**
 * Adds findings to each line (mutates) and returns the lookalike senders.
 * `lines` must be newest first, as the RPC returns them; `known` seeds the set
 * of genuine counterparties (e.g. from an earlier scan).
 */
export function applyRules(
	lines: TxLine[],
	opts: { preLamports?: Map<string, number>; known?: Iterable<string> } = {}
): { counterparties: Set<string>; poisoners: Set<string> } {
	const counterparties = new Set<string>(opts.known ?? []);
	const poisoners = new Set<string>();

	// Pass 1 (oldest → newest): who did this wallet really send to?
	// A destination counts as genuine unless it was itself a lookalike of an
	// earlier genuine one; that case is caught in pass 2 as sent_to_lookalike.
	const ordered = [...lines].reverse();
	for (const line of ordered) {
		// Swaps and program calls route through pools and vaults; only plain
		// transfers tell us who the owner actually pays.
		if (line.failed || !isPlainTransfer(line)) continue;
		for (const e of line.events) {
			if ((e.kind === 'sol_out' || e.kind === 'token_out') && e.counterparty) {
				if (!findImitated(e.counterparty, counterparties)) counterparties.add(e.counterparty);
			}
		}
	}

	// Pass 2: findings.
	for (const line of ordered) {
		const f: Finding[] = [];
		const strangerIncoming = line.events.some(
			(e) => (e.kind === 'sol_in' || e.kind === 'token_in') && e.counterparty && !counterparties.has(e.counterparty)
		);
		for (const e of line.events) {
			if (line.failed && e.kind !== 'approve') continue;
			switch (e.kind) {
				case 'sol_in':
				case 'token_in': {
					const from = e.counterparty;
					if (!from || counterparties.has(from)) break;
					// Lookalikes are checked in any transaction: poisoners often batch
					// their dust through their own program. Dust alone only in plain ones.
					const imitated = findImitated(from, counterparties);
					if (imitated) {
						poisoners.add(from);
						f.push({ kind: 'poisoning', severity: 'danger', subject: from, imitates: imitated, amount: e.amount, decimals: e.decimals, mint: e.mint });
					} else if (isPlainTransfer(line) && ((e.kind === 'sol_in' && big(e.amount) <= DUST_LAMPORTS) || (e.kind === 'token_in' && big(e.amount) === 0n))) {
						f.push({ kind: 'dust', severity: 'info', subject: from, amount: e.amount, decimals: e.decimals, mint: e.mint });
					}
					break;
				}
				case 'sol_out':
				case 'token_out': {
					const to = e.counterparty;
					if (!to) break;
					const imitated = poisoners.has(to) ? findImitated(to, counterparties) : [...counterparties].find((c) => c !== to && isLookalike(to, c));
					if (imitated && !counterparties.has(to)) {
						f.push({ kind: 'sent_to_lookalike', severity: 'danger', subject: to, imitates: imitated, amount: e.amount, decimals: e.decimals, mint: e.mint });
					}
					if (e.kind === 'sol_out') {
						const pre = opts.preLamports?.get(line.signature);
						if (pre && pre > 0) {
							const pct = Math.round((Number(e.amount) / pre) * 100);
							if (pct >= LARGE_OUTFLOW_PCT) f.push({ kind: 'large_outflow', severity: 'warn', subject: to, amount: e.amount, decimals: 9, pct });
						}
					}
					break;
				}
				case 'approve':
					if (line.failed) break;
					f.push({
						kind: 'delegate_granted',
						severity: isUnlimited(e.amount ?? '0') ? 'danger' : 'warn',
						subject: e.counterparty,
						amount: e.amount,
						decimals: e.decimals,
						mint: e.mint,
						tokenAccount: e.tokenAccount,
						tokenProgram: e.tokenProgram
					});
					break;
				case 'owner_change':
					f.push({ kind: 'owner_changed', severity: 'danger', subject: e.counterparty, tokenAccount: e.tokenAccount, mint: e.mint });
					break;
				case 'close_authority_change':
					f.push({ kind: 'close_authority_changed', severity: 'warn', subject: e.counterparty, tokenAccount: e.tokenAccount, mint: e.mint });
					break;
				case 'assign':
					f.push({ kind: 'wallet_assigned', severity: 'danger', subject: e.counterparty });
					break;
				case 'memo':
					if (strangerIncoming && e.text && URLISH.test(e.text)) f.push({ kind: 'phishing_memo', severity: 'warn', text: e.text });
					break;
			}
		}
		line.findings = f;
	}
	return { counterparties, poisoners };
}

/** No program beyond System/Token/ATA/Memo/ComputeBudget took part. */
export function isPlainTransfer(line: TxLine): boolean {
	return line.programs.length === 0;
}

const RANK: Record<Severity, number> = { ok: 0, info: 1, warn: 2, danger: 3 };

export function worst(a: Severity, b: Severity): Severity {
	return RANK[a] >= RANK[b] ? a : b;
}

export function buildReport(input: {
	address: string;
	lines: TxLine[];
	delegations: Delegation[];
	delegationsChecked?: boolean;
	preLamports?: Map<string, number>;
	complete: boolean;
	source: Report['source'];
	lamports: number;
	now?: number;
}): Report {
	const { counterparties, poisoners } = applyRules(input.lines, { preLamports: input.preLamports });
	const counts: Record<Severity, number> = { ok: 0, info: 0, warn: 0, danger: 0 };
	let verdict: Severity = 'ok';
	for (const line of input.lines)
		for (const f of line.findings) {
			counts[f.severity]++;
			verdict = worst(verdict, f.severity);
		}
	// Live delegations are the present tense: they outrank history.
	for (const d of input.delegations) {
		const s: Severity = d.unlimited ? 'danger' : 'warn';
		counts[s]++;
		verdict = worst(verdict, s);
	}
	return {
		address: input.address,
		scannedAt: input.now ?? Date.now(),
		lines: input.lines,
		delegations: input.delegations,
		delegationsChecked: input.delegationsChecked ?? true,
		counterparties: [...counterparties],
		poisoners: [...poisoners],
		verdict,
		counts,
		complete: input.complete,
		source: input.source,
		lamports: input.lamports
	};
}

export type SendCheck =
	| { verdict: 'known'; times: number; lastAt: number | null }
	| { verdict: 'poisoner'; imitates: string }
	| { verdict: 'lookalike'; imitates: string }
	| { verdict: 'new' }
	| { verdict: 'self' };

/** "I'm about to send to X" — is X someone this wallet already pays, or a copy of one? */
export function checkDestination(report: Pick<Report, 'address' | 'lines' | 'poisoners' | 'counterparties'>, dest: string): SendCheck {
	if (dest === report.address) return { verdict: 'self' };
	let times = 0;
	let lastAt: number | null = null;
	for (const line of report.lines) {
		if (line.failed || !isPlainTransfer(line)) continue;
		for (const e of line.events)
			if ((e.kind === 'sol_out' || e.kind === 'token_out') && e.counterparty === dest) {
				times++;
				if (lastAt === null) lastAt = line.blockTime;
			}
	}
	const genuine = report.counterparties.filter((c) => !report.poisoners.includes(c));
	if (report.poisoners.includes(dest)) return { verdict: 'poisoner', imitates: findImitated(dest, genuine) ?? '' };
	if (times > 0) return { verdict: 'known', times, lastAt };
	const imitated = findImitated(dest, genuine);
	if (imitated) return { verdict: 'lookalike', imitates: imitated };
	return { verdict: 'new' };
}
