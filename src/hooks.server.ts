import type { Handle } from '@sveltejs/kit';
import { pickLang } from '$lib/i18n';

export const handle: Handle = async ({ event, resolve }) => {
	const q = event.url.searchParams.get('lang');
	if (q === 'en' || q === 'tr') {
		event.cookies.set('lang', q, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: false, sameSite: 'lax' });
	}
	event.locals.lang = pickLang(q ?? event.cookies.get('lang'), event.request.headers.get('accept-language'));
	const res = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.lang)
	});
	res.headers.set('x-content-type-options', 'nosniff');
	res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	res.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};
