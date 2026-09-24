// Outgoing email through Cloudflare Email Service (send_email binding).
// Every attempt is logged: locally miniflare fakes success, so the log on the
// live database is the only proof delivery works.

import { t, type Lang } from '../i18n';
import { short } from '../engine/address';
import { describeLine, findingText } from '../describe';
import type { Finding, TxLine } from '../engine/types';

export interface MailEnv {
	EMAIL: { send(msg: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown> };
	MAIL_FROM: string;
	PUBLIC_ORIGIN: string;
	DB: D1Database;
}

function esc(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function frame(body: string, footer: string): string {
	return `<!doctype html><html><body style="margin:0;background:#F6F7F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E1726">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:18px;letter-spacing:-0.01em;margin-bottom:20px">Bekçi</div>
<div style="background:#fff;border:1px solid #E3E6EC;border-radius:10px;padding:24px">${body}</div>
<div style="font-size:12px;color:#6B7488;margin-top:16px;line-height:1.5">${footer}</div>
</div></body></html>`;
}

async function send(env: MailEnv, kind: string, watchId: string | null, msg: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
	try {
		await env.EMAIL.send({ ...msg, from: env.MAIL_FROM });
		await env.DB.prepare('INSERT INTO mail_log (kind, watch_id, ok, created_at) VALUES (?, ?, 1, ?)').bind(kind, watchId, Date.now()).run();
		return true;
	} catch (e) {
		const err = e as { code?: string; message?: string };
		await env.DB.prepare('INSERT INTO mail_log (kind, watch_id, ok, error, created_at) VALUES (?, ?, 0, ?, ?)')
			.bind(kind, watchId, `${err.code ?? ''} ${err.message ?? ''}`.trim().slice(0, 300), Date.now())
			.run();
		return false;
	}
}

export function sendConfirm(env: MailEnv, w: { id: string; email: string; address: string; token: string; lang: Lang }): Promise<boolean> {
	const link = `${env.PUBLIC_ORIGIN}/watch/confirm/${w.token}`;
	const L = w.lang;
	const subject = L === 'tr' ? `Nöbeti onayla: ${short(w.address)}` : `Confirm your watch on ${short(w.address)}`;
	const lead = L === 'tr' ? `${short(w.address)} cüzdanını izlememizi istedin. Başlatmak için aşağıdaki bağlantıya tıkla.` : `You asked Bekçi to watch ${short(w.address)}. Click below to start.`;
	const button = L === 'tr' ? 'Nöbeti başlat' : 'Start the watch';
	const ignore = L === 'tr' ? 'Bunu sen istemediysen bu e-postayı yok say; hiçbir şey başlamaz.' : 'If this was not you, ignore this email and nothing will start.';
	return send(env, 'confirm', w.id, {
		to: w.email,
		subject,
		text: `${lead}\n\n${link}\n\n${ignore}`,
		html: frame(
			`<p style="margin:0 0 16px;line-height:1.55">${esc(lead)}</p><p style="margin:0 0 8px"><a href="${link}" style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600">${button}</a></p><p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#475067;word-break:break-all">${esc(w.address)}</p>`,
			esc(ignore)
		)
	});
}

export function sendAlert(env: MailEnv, w: { id: string; email: string; address: string; token: string; lang: Lang }, line: TxLine, findings: Finding[]): Promise<boolean> {
	const L = w.lang;
	const report = `${env.PUBLIC_ORIGIN}/w/${w.address}`;
	const stop = `${env.PUBLIC_ORIGIN}/watch/stop/${w.token}`;
	const urgent = findings.some((f) => f.severity === 'danger');
	const subject = L === 'tr' ? `${urgent ? 'Acil: ' : ''}${short(w.address)} cüzdanında dikkat gerektiren işlem` : `${urgent ? 'Urgent: ' : ''}activity on ${short(w.address)} needs a look`;
	const what = describeLine(line, L).join('. ');
	const items = findings.map((f) => findingText(f, L));
	const open = t(L, 'confirm.open');
	const stopText = L === 'tr' ? 'Bu cüzdan için e-postaları durdur' : 'Stop emails for this wallet';
	const tx = `https://solscan.io/tx/${line.signature}`;
	return send(env, 'alert', w.id, {
		to: w.email,
		subject,
		text: `${what}\n\n${items.map((i) => `- ${i}`).join('\n')}\n\n${open}: ${report}\nSolscan: ${tx}\n\n${stopText}: ${stop}`,
		html: frame(
			`<p style="margin:0 0 12px;font-weight:600;line-height:1.5">${esc(what)}</p>${items
				.map((i) => `<p style="margin:0 0 10px;padding:10px 12px;background:${urgent ? '#FDE8E8' : '#FEF3C7'};border-radius:8px;line-height:1.5">${esc(i)}</p>`)
				.join('')}<p style="margin:16px 0 0"><a href="${report}" style="display:inline-block;background:#1E3A8A;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600">${esc(open)}</a> <a href="${tx}" style="margin-left:12px;color:#1E3A8A">Solscan</a></p>`,
			`<a href="${stop}" style="color:#6B7488">${esc(stopText)}</a>`
		)
	});
}
