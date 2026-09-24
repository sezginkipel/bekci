// Minimal JSON-RPC client. Solami is the data path when a key is configured;
// otherwise a public endpoint keeps the product usable (slower, rate limited).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RpcEnv {
	SOLAMI_API_KEY?: string;
	FALLBACK_RPC?: string;
}

export interface Rpc {
	source: 'solami' | 'fallback';
	call<T = any>(method: string, params: unknown[]): Promise<T>;
}

export class RpcError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly code?: number
	) {
		super(message);
	}
}

export function makeRpc(env: RpcEnv, fetcher: typeof fetch = fetch): Rpc {
	const key = env.SOLAMI_API_KEY?.trim();
	// Public endpoints each block something (publicnode refuses token-account
	// scans, the foundation endpoint rate-limits hard), so we walk a list.
	const urls = key
		? [`https://rpc.solami.dev/sol?api_key=${encodeURIComponent(key)}`]
		: [...(env.FALLBACK_RPC || 'https://solana-rpc.publicnode.com').split(','), 'https://api.mainnet-beta.solana.com'].map((u) => u.trim()).filter(Boolean);
	let id = 0;
	return {
		source: key ? 'solami' : 'fallback',
		async call(method, params) {
			let last: unknown;
			for (const url of urls) {
				try {
					return await callOne(url, method, params);
				} catch (e) {
					last = e;
					// A real answer ("not found", bad params) will not change on another node.
					if (e instanceof RpcError && e.status === 200 && e.code !== -32603) throw e;
				}
			}
			throw last;
		}
	};

	async function callOne(url: string, method: string, params: unknown[]): Promise<any> {
		for (let attempt = 0; ; attempt++) {
			const res = await fetcher(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
			});
			if (res.status === 429 && attempt < 3) {
				await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
				continue;
			}
			if (!res.ok) throw new RpcError(`RPC ${method} failed with HTTP ${res.status}`, res.status);
			const body: any = await res.json();
			if (body.error) {
				// Surface the node message; the caller decides whether another node helps.
				throw new RpcError(body.error.message ?? `RPC ${method} error`, res.status, body.error.code);
			}
			return body.result;
		}
	}
}

/** Run `fn` over items with at most `limit` in flight. Keeps us under free-tier rps. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i], i);
		}
	});
	await Promise.all(workers);
	return out;
}
