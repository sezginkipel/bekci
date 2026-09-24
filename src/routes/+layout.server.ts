import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => ({ lang: locals.lang, path: url.pathname });
