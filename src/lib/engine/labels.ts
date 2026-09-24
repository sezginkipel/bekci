// A small, honest label set: only addresses we can vouch for by their public docs.
// Anything else is shown as a shortened address.

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export const PROGRAMS: Record<string, string> = {
	[SYSTEM_PROGRAM]: 'System',
	[TOKEN_PROGRAM]: 'Token',
	[TOKEN_2022_PROGRAM]: 'Token-2022',
	ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token',
	ComputeBudget111111111111111111111111111111: 'Compute Budget',
	MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo',
	Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'Memo (v1)',
	JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter',
	whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
	'675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
	CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
	'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'Pump.fun',
	metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'Metaplex Metadata',
	M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K: 'Magic Eden',
	TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hAsbdwmHbN: 'Tensor Swap',
	Stake11111111111111111111111111111111111111: 'Stake'
};

export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
	So11111111111111111111111111111111111111112: { symbol: 'wSOL', decimals: 9 },
	EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', decimals: 6 },
	Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', decimals: 6 },
	'2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo': { symbol: 'PYUSD', decimals: 6 },
	JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: 'JUP', decimals: 6 },
	DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: 'BONK', decimals: 5 }
};

export function programLabel(id: string): string | undefined {
	return PROGRAMS[id];
}

export function tokenSymbol(mint: string | undefined): string | undefined {
	return mint ? TOKENS[mint]?.symbol : undefined;
}

export function isTokenProgram(id: string | undefined): boolean {
	return id === TOKEN_PROGRAM || id === TOKEN_2022_PROGRAM;
}
