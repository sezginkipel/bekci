import { defineConfig } from 'vitest/config';

// Engine tests are plain TS; they do not need the SvelteKit plugin.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
