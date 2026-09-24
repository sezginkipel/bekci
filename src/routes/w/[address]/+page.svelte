<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { t, type Key } from '$lib/i18n';
	import { amount, ago, sol, token, when, who } from '$lib/format';
	import { describeLine, findingText, netText } from '$lib/describe';
	import { checkDestination, worst, type SendCheck } from '$lib/engine/risk';
	import { isAddressShape, short } from '$lib/engine/address';
	import type { Delegation, Severity, TxLine } from '$lib/engine/types';
	import { revokeDelegate } from '$lib/client/revoke';
	import Addr from '$lib/components/Addr.svelte';
	import Stamp from '$lib/components/Stamp.svelte';

	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { makeRpc } from '$lib/chain/rpc';
	import { scanWallet } from '$lib/chain/scan';
	import type { Report } from '$lib/engine/types';

	let { data, form } = $props();
	const L = $derived(data.lang);
	// Server report when the node answered it; otherwise the browser reads the chain.
	let clientReport = $state<Report | null>(null);
	let clientError = $state(false);
	const r = $derived((data.report ?? clientReport) as Report);
	async function scanHere() {
		clientError = false;
		try {
			clientReport = await scanWallet(makeRpc({}), page.params.address!);
		} catch {
			clientError = true;
		}
	}
	onMount(() => {
		if (data.clientScan && !data.report) scanHere();
	});
	const k = (s: string) => s as Key;

	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 15_000);
		return () => clearInterval(id);
	});

	function lineSeverity(line: TxLine): Severity | null {
		if (!line.findings.length) return null;
		return line.findings.reduce<Severity>((s, f) => worst(s, f.severity), 'info');
	}

	// Copy address
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(r.address);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			/* clipboard blocked: the address is selectable text anyway */
		}
	}

	// Before you send
	let dest = $state('');
	let check = $state<SendCheck | 'bad' | null>(null);
	function runCheck(e: SubmitEvent) {
		e.preventDefault();
		const d = dest.trim();
		check = isAddressShape(d) ? checkDestination(r, d) : 'bad';
	}

	// Revoke
	let revoking = $state<string | null>(null);
	let revokeMsg = $state<Record<string, { tone: 'ok' | 'bad'; text: string }>>({});
	async function revoke(d: Delegation) {
		revoking = d.tokenAccount;
		const res = await revokeDelegate({ owner: r.address, tokenAccount: d.tokenAccount, tokenProgram: d.tokenProgram });
		revoking = null;
		let msg: { tone: 'ok' | 'bad'; text: string };
		if (res.ok) msg = { tone: 'ok', text: t(L, 'now.revoked', { sig: short(res.signature, 6) }) };
		else if (res.code === 'nowallet') msg = { tone: 'bad', text: t(L, 'now.nowallet') };
		else if (res.code === 'wrong') msg = { tone: 'bad', text: t(L, 'now.wrongwallet', { connected: short(res.connected), watched: short(r.address) }) };
		else msg = { tone: 'bad', text: t(L, 'now.failed', { reason: res.reason }) };
		revokeMsg = { ...revokeMsg, [d.tokenAccount]: msg };
	}

	let rescanning = $state(false);
	async function rescan() {
		rescanning = true;
		const u = new URL(location.href);
		if (data.clientScan) {
			await scanHere();
		} else {
			u.searchParams.set('fresh', '1');
			history.replaceState(history.state, '', u);
			await invalidateAll();
			u.searchParams.delete('fresh');
			history.replaceState(history.state, '', u);
		}
		rescanning = false;
	}

	let watching = $state(false);
</script>

<svelte:head>
	<title>{short(page.params.address ?? '')} · {t(L, 'report.title')} · Bekçi</title>
	<meta name="description" content={t(L, 'meta.desc')} />
	<meta name="robots" content="noindex" />
</svelte:head>

{#if !r}
	<section class="wrap reading">
		<p class="eyebrow">{t(L, 'report.title')}</p>
		<h1 class="who"><Addr value={page.params.address ?? ''} /></h1>
		{#if clientError}
			<p class="res bad" role="alert">{t(L, 'err.rpc')}</p>
			<button class="btn btn-primary" type="button" onclick={scanHere}>{t(L, 'report.rescan')}</button>
		{:else}
			<p class="muted" role="status"><span class="lamp pulse" aria-hidden="true"></span> {t(L, 'report.reading')}</p>
		{/if}
	</section>
{:else}

<section class="head">
	<div class="wrap">
		<p class="eyebrow">{t(L, 'report.title')}</p>
		<h1 class="who"><Addr value={r.address} /></h1>
		<div class="tools">
			<button class="btn btn-quiet sm" type="button" onclick={copy}>{copied ? t(L, 'report.copied') : t(L, 'report.copy')}</button>
			<button class="btn btn-quiet sm" type="button" onclick={rescan} disabled={rescanning}>{t(L, 'report.rescan')}</button>
			<a class="btn btn-quiet sm" href="https://solscan.io/account/{r.address}" target="_blank" rel="noopener noreferrer">{t(L, 'report.explorer')}</a>
		</div>
		<p class="meta mono">
			<span>{r.complete ? t(L, 'report.scannedAll', { n: r.lines.length }) : t(L, 'report.scanned', { n: r.lines.length })}</span>
			<span>{t(L, 'report.at', { time: ago(r.scannedAt, now, L) })}</span>
			<span>{t(L, r.source === 'solami' ? 'report.source.solami' : 'report.source.fallback')}</span>
			<span>{t(L, 'report.balance', { sol: sol(r.lamports, L) })}</span>
		</p>
	</div>
</section>

<section class="verdict v-{r.verdict}" aria-live="polite">
	<div class="wrap vrow">
		<span class="lamp" aria-hidden="true"></span>
		<div>
			<h2>{t(L, k(`verdict.${r.verdict}`))}</h2>
			<p>{t(L, k(`verdict.${r.verdict}.sub`))}</p>
		</div>
		<dl class="counts mono">
			{#each ['danger', 'warn', 'info'] as s (s)}
				<div><dt><Stamp severity={s as Severity} label={t(L, k(`stamp.${s}`))} /></dt><dd>{r.counts[s as Severity]}</dd></div>
			{/each}
		</dl>
	</div>
</section>

<div class="wrap body">
	<aside class="side">
		<section class="panel" aria-labelledby="now-h">
			<h3 id="now-h">{t(L, 'now.title')}</h3>
			{#if !r.delegationsChecked}
				<p class="muted">{t(L, 'now.unchecked')}</p>
			{:else if r.delegations.length === 0}
				<p class="calm"><Stamp severity="ok" label={t(L, 'stamp.ok')} /> {t(L, 'now.none')}</p>
			{:else}
				<ul class="dels">
					{#each r.delegations as d (d.tokenAccount)}
						<li class={d.unlimited ? 'd-danger' : 'd-warn'}>
							<p>
								{d.unlimited
									? t(L, 'now.delegate.all', { who: who(d.delegate), token: token(d.mint) })
									: t(L, 'now.delegate', { who: who(d.delegate), amount: amount(d.amount, d.decimals, L), token: token(d.mint) })}
							</p>
							<p class="mono small"><Addr value={d.delegate} full={false} /></p>
							<button class="btn btn-primary sm" type="button" onclick={() => revoke(d)} disabled={revoking === d.tokenAccount}>
								{revoking === d.tokenAccount ? t(L, 'now.revoking') : t(L, 'now.revoke')}
							</button>
							{#if revokeMsg[d.tokenAccount]}
								<p class="rmsg {revokeMsg[d.tokenAccount].tone}" role="status">{revokeMsg[d.tokenAccount].text}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel" aria-labelledby="send-h">
			<h3 id="send-h">{t(L, 'send.title')}</h3>
			<p class="muted">{t(L, 'send.lead')}</p>
			<form class="stack" onsubmit={runCheck}>
				<label class="sr-only" for="dest">{t(L, 'send.placeholder')}</label>
				<input id="dest" class="field mono" bind:value={dest} placeholder={t(L, 'send.placeholder')} autocomplete="off" spellcheck="false" autocapitalize="off" />
				<button class="btn btn-quiet">{t(L, 'send.submit')}</button>
			</form>
			{#if check}
				{#if check === 'bad'}
					<p class="res bad" role="status">{t(L, 'send.bad')}</p>
				{:else if check.verdict === 'known'}
					<p class="res ok" role="status">
						{check.times === 1 ? t(L, 'send.known1', { date: when(check.lastAt, L, false) }) : t(L, 'send.known', { n: check.times, date: when(check.lastAt, L, false) })}
					</p>
				{:else if check.verdict === 'poisoner'}
					<p class="res danger" role="status">{t(L, 'send.poisoner', { real: short(check.imitates) })}</p>
				{:else if check.verdict === 'lookalike'}
					<p class="res danger" role="status">{t(L, 'send.lookalike', { real: short(check.imitates) })}</p>
				{:else if check.verdict === 'self'}
					<p class="res info" role="status">{t(L, 'send.self')}</p>
				{:else}
					<p class="res info" role="status">{t(L, 'send.new')}</p>
				{/if}
				{#if check !== 'bad' && (check.verdict === 'poisoner' || check.verdict === 'lookalike')}
					<div class="compare mono">
						<span class="ok-row"><Addr value={check.imitates} /></span>
						<span class="bad-row"><Addr value={dest.trim()} /></span>
					</div>
				{/if}
			{/if}
		</section>

		<section class="panel" id="keep" aria-labelledby="keep-h">
			<h3 id="keep-h">{t(L, 'keep.title')}</h3>
			{#if !data.realtime}
				<p class="muted">{t(L, 'keep.soon')}</p>
			{:else if form?.sent}
				<p class="res ok" role="status">{t(L, 'keep.sent', { email: form.email ?? '' })}</p>
			{:else}
				<p class="muted">{t(L, 'keep.lead')}</p>
				<form
					class="stack"
					method="POST"
					action="?/watch"
					use:enhance={() => {
						watching = true;
						return async ({ update }) => {
							await update({ reset: false, invalidateAll: false });
							watching = false;
						};
					}}
				>
					<label class="sr-only" for="email">{t(L, 'keep.email')}</label>
					<input id="email" name="email" type="email" class="field" placeholder={t(L, 'keep.email')} autocomplete="email" required value={form?.email ?? ''} />
					<button class="btn btn-primary" disabled={watching}>{t(L, 'keep.submit')}</button>
				</form>
				{#if form?.watchError}
					<p class="res bad" role="alert">{form.watchError}</p>
				{/if}
				<p class="muted small">{t(L, 'keep.channel')}</p>
			{/if}
		</section>
	</aside>

	<section class="log" aria-labelledby="log-h">
		<h3 id="log-h">{t(L, 'log.title')}</h3>
		{#if r.lines.length === 0}
			<p class="empty">{t(L, 'log.empty')}</p>
		{:else}
			<ol class="rows">
				{#each r.lines as line (line.signature)}
					{@const sev = lineSeverity(line)}
					<li class="row" class:has={sev}>
						<div class="margin">
							{#if sev}<Stamp severity={sev} label={t(L, k(`stamp.${sev}`))} />{/if}
						</div>
						<time class="when mono" datetime={line.blockTime ? new Date(line.blockTime * 1000).toISOString() : undefined}>{when(line.blockTime, L)}</time>
						<div class="what">
							{#if line.events.length === 0 && line.net.length === 0 && line.programs.length === 0}
								<p class="muted">{t(L, 'log.unknown')}</p>
							{:else}
								{#each describeLine(line, L) as s, i (i)}<p>{s}</p>{/each}
							{/if}
							{#if line.net.length && line.programs.length}
								<p class="net mono">{t(L, 'ev.net')} {netText(line, L)}</p>
							{/if}
							{#each line.findings as f, i (i)}
								<div class="finding f-{f.severity}">
									<p>{findingText(f, L)}</p>
									{#if f.imitates && f.subject}
										<div class="compare mono">
											<span class="ok-row"><Addr value={f.imitates} /></span>
											<span class="bad-row"><Addr value={f.subject} /></span>
										</div>
									{/if}
								</div>
							{/each}
							<p class="foot mono">
								<a href="https://solscan.io/tx/{line.signature}" target="_blank" rel="noopener noreferrer">{short(line.signature, 6)}</a>
								{#if line.fee}<span>{t(L, 'log.fee', { sol: sol(line.fee, L) })}</span>{/if}
								{#if line.failed}<span class="failed">{t(L, 'log.failed')}</span>{/if}
							</p>
						</div>
					</li>
				{/each}
			</ol>
			{#if !r.complete}<p class="muted small more">{t(L, 'log.more', { n: r.lines.length })}</p>{/if}
		{/if}
	</section>
</div>

{/if}

<style>
	.reading {
		padding: var(--s7) var(--s5) var(--s8);
		display: grid;
		gap: var(--s4);
		justify-items: start;
	}
	.reading .muted {
		display: flex;
		align-items: center;
		gap: var(--s3);
	}
	.pulse {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--lamp);
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			box-shadow: 0 0 0 8px rgb(242 184 75 / 0.18);
		}
	}
	.head {
		padding: var(--s7) 0 var(--s5);
	}
	.who {
		font-size: clamp(17px, 2.6vw, 30px);
		font-weight: 500;
		letter-spacing: 0;
		margin: var(--s2) 0 var(--s4);
		line-height: 1.35;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s2);
	}
	.btn.sm {
		min-height: 40px;
		padding: 0 var(--s4);
		font-size: 14px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s2) var(--s5);
		margin-top: var(--s4);
		font-size: 12.5px;
		color: var(--ink-3);
	}

	.verdict {
		border-block: 1px solid var(--line);
		padding: var(--s5) 0;
	}
	.vrow {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--s4);
		align-items: center;
	}
	.verdict h2 {
		font-size: clamp(22px, 3vw, 30px);
	}
	.verdict p {
		color: var(--ink-2);
		margin-top: var(--s1);
	}
	.verdict .lamp {
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}
	.v-danger {
		background: var(--danger);
	}
	.v-danger .lamp {
		background: var(--danger-ink);
		box-shadow: 0 0 0 6px rgb(143 29 29 / 0.14);
	}
	.v-warn {
		background: var(--warn);
	}
	.v-warn .lamp {
		background: var(--lamp);
		box-shadow: 0 0 0 6px rgb(242 184 75 / 0.25);
	}
	.v-info,
	.v-ok {
		background: var(--bg-2);
	}
	.v-info .lamp,
	.v-ok .lamp {
		background: var(--ok-ink);
		box-shadow: 0 0 0 6px rgb(23 97 58 / 0.12);
	}
	.counts {
		display: flex;
		gap: var(--s4);
		margin: 0;
	}
	.counts div {
		display: flex;
		align-items: center;
		gap: var(--s2);
	}
	.counts dd {
		margin: 0;
		font-weight: 600;
		font-size: 15px;
	}
	@media (max-width: 720px) {
		.vrow {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.counts {
			grid-column: 1 / -1;
		}
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr);
		gap: var(--s6);
		padding-top: var(--s6);
		align-items: start;
	}
	@media (max-width: 960px) {
		.body {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	h3 {
		font-size: 18px;
		letter-spacing: -0.01em;
		margin-bottom: var(--s3);
	}
	.side {
		display: grid;
		gap: var(--s4);
	}
	.panel {
		border: 1px solid var(--line);
		border-radius: var(--r2);
		padding: var(--s5);
		background: var(--bg);
	}
	.muted {
		color: var(--ink-2);
		font-size: 15px;
	}
	.small {
		font-size: 13px;
		margin-top: var(--s3);
	}
	.calm {
		display: flex;
		gap: var(--s2);
		align-items: baseline;
		color: var(--ink-2);
	}
	.stack {
		display: grid;
		gap: var(--s2);
		margin-top: var(--s3);
	}
	.res {
		margin-top: var(--s3);
		padding: var(--s3);
		border-radius: var(--r1);
		font-size: 15px;
	}
	.res.ok {
		background: var(--ok);
		color: var(--ok-ink);
	}
	.res.danger,
	.res.bad {
		background: var(--danger);
		color: var(--danger-ink);
	}
	.res.info {
		background: var(--info);
		color: var(--info-ink);
	}
	.dels {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s3);
	}
	.dels li {
		padding: var(--s3);
		border-radius: var(--r1);
		display: grid;
		gap: var(--s2);
		justify-items: start;
	}
	.d-danger {
		background: var(--danger);
		color: var(--danger-ink);
	}
	.d-warn {
		background: var(--warn);
		color: var(--warn-ink);
	}
	.rmsg {
		font-size: 14px;
	}
	.rmsg.bad {
		color: var(--danger-ink);
	}
	.rmsg.ok {
		color: var(--ok-ink);
	}
	.compare {
		display: grid;
		gap: 2px;
		margin-top: var(--s2);
		font-size: 12.5px;
	}
	.compare span {
		padding: 4px 8px;
		border-radius: 4px;
		background: var(--bg);
	}
	.compare .ok-row {
		border-left: 3px solid var(--ok-ink);
	}
	.compare .bad-row {
		border-left: 3px solid var(--danger-ink);
	}

	.log h3 {
		padding-bottom: var(--s3);
		border-bottom: 2px solid var(--ink);
		margin-bottom: 0;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* Logbook line: stamp in the margin, time, then what happened. */
	.row {
		display: grid;
		grid-template-columns: 72px 128px minmax(0, 1fr);
		gap: var(--s3);
		padding: var(--s3) 0;
		border-bottom: 1px solid var(--line);
		align-items: start;
	}
	.margin {
		padding-top: 2px;
	}
	.when {
		font-size: 12px;
		color: var(--ink-3);
		padding-top: 3px;
	}
	.what p {
		line-height: 1.5;
	}
	.net {
		font-size: 12.5px;
		color: var(--ink-2);
		margin-top: 2px;
	}
	.finding {
		margin-top: var(--s2);
		padding: var(--s3);
		border-radius: var(--r1);
		font-size: 15px;
	}
	.f-danger {
		background: var(--danger);
		color: var(--danger-ink);
	}
	.f-warn {
		background: var(--warn);
		color: var(--warn-ink);
	}
	.f-info {
		background: var(--info);
		color: var(--info-ink);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s4);
		font-size: 12px;
		color: var(--ink-3);
		margin-top: var(--s2);
	}
	.foot a {
		color: var(--ink-2);
	}
	.failed {
		color: var(--danger-ink);
		font-weight: 600;
	}
	.empty {
		padding: var(--s6) 0;
		color: var(--ink-2);
	}
	.more {
		margin-top: var(--s4);
	}
	@media (max-width: 640px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s1);
		}
		.margin:empty {
			display: none;
		}
	}
</style>
