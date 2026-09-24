// Turns a decoded line into sentences. Shared by the report page and alert emails.

import { amount, token, who } from './format';
import { t, type Lang } from './i18n';
import { programLabel } from './engine/labels';
import type { Finding, TxLine, WalletEvent } from './engine/types';

function eventText(e: WalletEvent, lang: Lang): string | null {
	const vars = { who: who(e.counterparty), amount: amount(e.amount, e.decimals, lang), token: token(e.mint) };
	switch (e.kind) {
		case 'sol_out':
		case 'sol_in':
		case 'token_out':
		case 'token_in':
		case 'approve':
		case 'revoke':
		case 'owner_change':
		case 'close_authority_change':
		case 'assign':
		case 'close_account':
			return t(lang, `ev.${e.kind}`, vars);
		case 'program':
			return t(lang, 'ev.program', vars);
		default:
			return null;
	}
}

/** Main sentence(s) for a line: grouped so a 20-transfer batch reads as one line. */
export function describeLine(line: TxLine, lang: Lang): string[] {
	if (line.programs.length && !line.events.some((e) => e.kind === 'approve' || e.kind === 'owner_change' || e.kind === 'assign')) {
		// Program call (swap, mint, game…): name the program, show net change.
		const p = line.programs.find((x) => programLabel(x)) ?? line.programs[0];
		const verb = /Jupiter|Raydium|Orca|Pump/.test(programLabel(p) ?? '') ? 'ev.swap' : 'ev.program';
		return [t(lang, verb, { who: who(p) })];
	}
	const out: string[] = [];
	const groups = new Map<string, { e: WalletEvent; n: number; sum: bigint }>();
	for (const e of line.events) {
		if (e.kind === 'memo') continue;
		const k = `${e.kind}|${e.counterparty}|${e.mint ?? ''}`;
		const g = groups.get(k);
		if (g) {
			g.n++;
			try {
				g.sum += BigInt(e.amount ?? '0');
			} catch {
				/* keep count only */
			}
		} else {
			let sum = 0n;
			try {
				sum = BigInt(e.amount ?? '0');
			} catch {
				/* not a number */
			}
			groups.set(k, { e, n: 1, sum });
		}
	}
	for (const { e, n, sum } of groups.values()) {
		const text = eventText({ ...e, amount: n > 1 ? sum.toString() : e.amount }, lang);
		if (text) out.push(n > 1 ? `${text} (${t(lang, 'ev.times', { n })})` : text);
	}
	return out;
}

export function netText(line: TxLine, lang: Lang): string {
	return line.net
		.map((n) => {
			const v = amount(n.delta, n.decimals, lang);
			return `${n.delta.startsWith('-') ? '' : '+'}${v} ${token(n.asset)}`;
		})
		.join(' · ');
}

export function findingText(f: Finding, lang: Lang): string {
	const vars = {
		who: who(f.subject),
		real: who(f.imitates),
		token: token(f.mint),
		pct: f.pct ?? 0
	};
	if (f.kind === 'delegate_granted' && f.severity === 'danger') return t(lang, 'f.delegate_granted.unlimited', vars);
	return t(lang, `f.${f.kind}`, vars);
}
