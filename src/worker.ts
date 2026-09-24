/**
 * Worker entry: SvelteKit for every request, plus the minute cron that runs
 * the watcher (the adapter's generated worker only exports fetch).
 * The adapter builds to .svelte-kit/cloudflare/_worker.js through
 * wrangler.adapter.jsonc, so this file is never overwritten.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore build output, absent before the first build
import generatedWorker from '../.svelte-kit/cloudflare/_worker.js';
import { cronTick } from './lib/server/watcher';

const sveltekit = generatedWorker as {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
};

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return sveltekit.fetch(request, env, ctx);
	},
	async scheduled(_controller: ScheduledController, env: Env) {
		// Awaited so failures show up in the cron log instead of vanishing in waitUntil.
		const summary = await cronTick(env);
		console.log('cron', JSON.stringify(summary));
	}
};
