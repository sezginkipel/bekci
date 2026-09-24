// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Lang } from '$lib/i18n';

declare global {
	interface Env {
		DB: D1Database;
		KV: KVNamespace;
		EMAIL: { send(msg: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown> };
		PUBLIC_ORIGIN: string;
		FALLBACK_RPC: string;
		MAIL_FROM: string;
		SOLAMI_API_KEY?: string;
		/** Salt for hashing IPs in the rate limit; set with wrangler secret. */
		IP_SALT?: string;
	}
	namespace App {
		interface Locals {
			lang: Lang;
		}
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
