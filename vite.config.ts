import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// SvelteKit options live here (sv template style); there is no svelte.config.js.
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// Adapter gets its own wrangler config so it never overwrites src/worker.ts.
			adapter: adapter({ config: 'wrangler.adapter.jsonc' }),
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					// The zone injects Cloudflare Web Analytics; without this the beacon is blocked.
					'script-src': ['self', 'https://static.cloudflareinsights.com'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:'],
					'font-src': ['self'],
					// Public RPCs: the browser reads the chain itself when the server is refused.
					'connect-src': ['self', 'https://cloudflareinsights.com', 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'frame-ancestors': ['none'],
					'form-action': ['self']
				}
			}
		})
	]
});
