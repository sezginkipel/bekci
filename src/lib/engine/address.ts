// Address helpers. Poisoning works because people check only the first and last
// few characters, so that is exactly what we measure.

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isAddressShape(s: string): boolean {
	return B58.test(s);
}

export function short(addr: string, n = 4): string {
	return addr.length <= n * 2 + 1 ? addr : `${addr.slice(0, n)}…${addr.slice(-n)}`;
}

/** Characters shared at the start and at the end (case-sensitive, base58). */
export function edgeMatch(a: string, b: string): { prefix: number; suffix: number } {
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let suffix = 0;
	while (
		suffix < a.length - prefix &&
		suffix < b.length - prefix &&
		a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
	)
		suffix++;
	return { prefix, suffix };
}

/**
 * Two different addresses that agree on enough edge characters to fool a glance.
 * Two random base58 addresses pass this with odds of about 1 in 13 billion
 * (3·58⁻⁶ minus overlaps), so a hit is deliberate. Both ends must match: real poisoners grind both.
 */
export function isLookalike(a: string, b: string): boolean {
	if (a === b) return false;
	const { prefix, suffix } = edgeMatch(a, b);
	return prefix >= 2 && suffix >= 2 && prefix + suffix >= 6;
}

export function findImitated(candidate: string, genuine: Iterable<string>): string | undefined {
	for (const g of genuine) if (isLookalike(candidate, g)) return g;
	return undefined;
}

/** Split for display: the edges people read, and the middle they skip. */
export function splitEdges(addr: string, n = 4): [string, string, string] {
	if (addr.length <= n * 2) return [addr, '', ''];
	return [addr.slice(0, n), addr.slice(n, -n), addr.slice(-n)];
}
