import { short } from './engine/address';
import { programLabel, tokenSymbol } from './engine/labels';
import type { Lang } from './i18n';

/** Base units → human amount, trimmed, locale separators. Exact for any size. */
export function amount(base: string | undefined, decimals: number | undefined, lang: Lang): string {
	let v: bigint;
	try {
		v = BigInt(base ?? '0');
	} catch {
		return base ?? '';
	}
	const d = decimals ?? 0;
	const neg = v < 0n;
	if (neg) v = -v;
	const s = v.toString().padStart(d + 1, '0');
	const int = s.slice(0, s.length - d) || '0';
	let frac = d ? s.slice(-d).replace(/0+$/, '') : '';
	// Keep at most 6 significant fraction digits for large amounts; show dust in full.
	if (frac.length > 6 && int !== '0') frac = frac.slice(0, 6).replace(/0+$/, '');
	const group = lang === 'tr' ? '.' : ',';
	const dec = lang === 'tr' ? ',' : '.';
	const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
	return `${neg ? '−' : ''}${grouped}${frac ? dec + frac : ''}`;
}

export function sol(lamports: number | string, lang: Lang): string {
	return amount(String(lamports), 9, lang);
}

export function token(mint: string | undefined): string {
	if (!mint) return 'tokens';
	if (mint === 'SOL') return 'SOL';
	return tokenSymbol(mint) ?? short(mint);
}

export function who(addr: string | undefined): string {
	if (!addr) return '?';
	return programLabel(addr) ?? short(addr);
}

export function when(unix: number | null, lang: Lang, withTime = true): string {
	if (!unix) return '';
	const d = new Date(unix * 1000);
	return d.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
		timeZone: 'UTC'
	}) + (withTime ? ' UTC' : '');
}

export function ago(ms: number, now: number, lang: Lang): string {
	const s = Math.max(0, Math.round((now - ms) / 1000));
	const rtf = new Intl.RelativeTimeFormat(lang === 'tr' ? 'tr' : 'en', { numeric: 'auto' });
	if (s < 60) return rtf.format(-s, 'second');
	if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
	if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
	return rtf.format(-Math.round(s / 86400), 'day');
}
