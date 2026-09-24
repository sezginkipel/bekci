<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, type Key } from '$lib/i18n';
	import Addr from '$lib/components/Addr.svelte';

	let { data, form } = $props();
	const L = $derived(data.lang);
	let busy = $state(false);

	// Made-up pair for the illustration (labelled as such on the page).
	const REAL = '7xKpQm3vRtN8wZ2hYbC4dLfE9gJ6sA1uVn5oXiTcFh9Q';
	const FAKE = '7xKpVd8kqLz1Ws7mNe3RtY5bUc9HjG2aP4fQo6XwFh9Q';

	const rows: { id: string; sev: 'danger' | 'warn' }[] = [
		{ id: 'poison', sev: 'danger' },
		{ id: 'delegate', sev: 'danger' },
		{ id: 'owner', sev: 'danger' },
		{ id: 'memo', sev: 'warn' },
		{ id: 'outflow', sev: 'warn' }
	];
	const k = (s: string) => s as Key;
</script>

<svelte:head>
	<title>{t(L, 'meta.title')}</title>
	<meta name="description" content={t(L, 'meta.desc')} />
	<meta property="og:title" content={t(L, 'meta.title')} />
	<meta property="og:description" content={t(L, 'meta.desc')} />
	<meta property="og:type" content="website" />
</svelte:head>

<section class="hero">
	<div class="wrap">
		<form
			method="POST"
			class="ask"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			<label for="address" class="lead">{t(L, 'hero.lead')}</label>
			<div class="line">
				<input
					id="address"
					name="address"
					class="mono"
					placeholder={t(L, 'hero.placeholder')}
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					required
					value={form?.address ?? ''}
					aria-invalid={form?.bad ? 'true' : undefined}
					aria-describedby="hero-note"
				/>
				<button class="btn btn-primary go" disabled={busy}>{t(L, 'hero.submit')}</button>
			</div>
			{#if form?.bad}
				<p class="bad" role="alert">{t(L, 'hero.bad')}</p>
			{:else}
				<p id="hero-note" class="note">{t(L, 'hero.note')}</p>
			{/if}
		</form>
	</div>
</section>

<section class="demo">
	<div class="wrap demo-grid">
		<div class="copy">
			<h2>{t(L, 'demo.title')}</h2>
			<p>{t(L, 'demo.body')}</p>
		</div>
		<figure class="sheet" aria-label={t(L, 'demo.example')}>
			<div class="entry">
				<span class="tag ok">{L === 'tr' ? 'gerçek' : 'real'}</span>
				<p class="cap">{t(L, 'demo.real')}</p>
				<p class="big"><Addr value={REAL} /></p>
			</div>
			<div class="entry">
				<span class="tag danger">{L === 'tr' ? 'taklit' : 'fake'}</span>
				<p class="cap">{t(L, 'demo.fake')}</p>
				<p class="big"><Addr value={FAKE} /></p>
			</div>
			<figcaption>
				<strong>{t(L, 'demo.same')}</strong>
				<span class="note">{t(L, 'demo.example')}</span>
			</figcaption>
		</figure>
	</div>
</section>

<section id="watch" class="watch">
	<div class="wrap">
		<h2>{t(L, 'watch.title')}</h2>
		<div class="table" role="table">
			<div class="tr head" role="row">
				<span role="columnheader">{t(L, 'watch.col.what')}</span>
				<span role="columnheader">{t(L, 'watch.col.looks')}</span>
				<span role="columnheader">{t(L, 'watch.col.does')}</span>
			</div>
			{#each rows as r (r.id)}
				<div class="tr" role="row">
					<span role="cell" class="what"><span class="dot {r.sev}" aria-hidden="true"></span>{t(L, k(`watch.${r.id}.what`))}</span>
					<span role="cell">{t(L, k(`watch.${r.id}.looks`))}</span>
					<span role="cell">{t(L, k(`watch.${r.id}.does`))}</span>
				</div>
			{/each}
		</div>
	</div>
</section>

<section class="trust">
	<div class="wrap trust-grid">
		<h2>{t(L, 'trust.title')}</h2>
		<p>{t(L, 'trust.body')}</p>
	</div>
</section>

<style>
	.hero {
		padding: var(--s9) 0 var(--s8);
		border-bottom: 1px solid var(--line);
	}
	.ask {
		max-width: 980px;
	}
	.lead {
		display: block;
		font-size: clamp(40px, 7vw, 84px);
		font-weight: 640;
		letter-spacing: -0.035em;
		line-height: 1;
		margin-bottom: var(--s5);
	}
	/* The input is a ruled logbook line, not a boxed field. */
	.line {
		display: flex;
		align-items: flex-end;
		gap: var(--s4);
		border-bottom: 2px solid var(--ink);
		padding-bottom: var(--s3);
	}
	.line:focus-within {
		border-bottom-color: var(--focus);
	}
	input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--ink);
		font-size: clamp(17px, 2.2vw, 24px);
		padding: var(--s2) 0;
	}
	input::placeholder {
		color: var(--ink-3);
	}
	.go {
		flex: none;
		min-height: 52px;
		padding: 0 var(--s6);
		font-size: 16px;
	}
	.hero .note,
	.bad {
		margin-top: var(--s4);
	}
	.bad {
		color: var(--danger-ink);
		background: var(--danger);
		border-radius: var(--r1);
		padding: var(--s2) var(--s3);
		display: inline-block;
	}
	@media (max-width: 640px) {
		.hero {
			padding: var(--s8) 0 var(--s7);
		}
		.line {
			flex-direction: column;
			align-items: stretch;
			border-bottom: 0;
			padding-bottom: 0;
		}
		input {
			border-bottom: 2px solid var(--ink);
			padding-bottom: var(--s3);
		}
		.go {
			width: 100%;
		}
	}

	.demo {
		padding: var(--s8) 0;
		background: var(--bg-2);
		border-bottom: 1px solid var(--line);
	}
	.demo-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
		gap: var(--s7);
		align-items: center;
	}
	.copy h2 {
		font-size: clamp(26px, 3.2vw, 36px);
		margin-bottom: var(--s4);
	}
	.copy p {
		color: var(--ink-2);
		font-size: 17px;
		max-width: 46ch;
	}
	.sheet {
		margin: 0;
		background: var(--bg);
		border: 1px solid var(--line);
		border-radius: var(--r2);
		padding: var(--s5);
		display: grid;
		gap: var(--s5);
	}
	.entry {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr);
		column-gap: var(--s4);
		row-gap: var(--s1);
		align-items: baseline;
	}
	.tag {
		grid-row: span 2;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 2px 8px;
		border-radius: 4px;
		text-align: center;
	}
	.tag.ok {
		background: var(--ok);
		color: var(--ok-ink);
	}
	.tag.danger {
		background: var(--danger);
		color: var(--danger-ink);
	}
	.cap {
		font-size: 14px;
		color: var(--ink-2);
	}
	.big {
		font-size: clamp(14px, 1.6vw, 18px);
	}
	figcaption {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--s2);
		border-top: 1px dashed var(--line-2);
		padding-top: var(--s4);
	}
	@media (max-width: 860px) {
		.demo-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s5);
		}
		.entry {
			grid-template-columns: minmax(0, 1fr);
		}
		.tag {
			grid-row: auto;
			justify-self: start;
		}
	}

	.watch {
		padding: var(--s8) 0 var(--s7);
	}
	.watch h2,
	.trust h2 {
		font-size: clamp(26px, 3.2vw, 36px);
		margin-bottom: var(--s5);
	}
	.table {
		border-top: 2px solid var(--ink);
	}
	.tr {
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) minmax(0, 1.2fr);
		gap: var(--s5);
		padding: var(--s4) 0;
		border-bottom: 1px solid var(--line);
		color: var(--ink-2);
	}
	.tr.head {
		font-family: var(--mono);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-3);
		padding: var(--s3) 0;
	}
	.what {
		color: var(--ink);
		font-weight: 600;
		display: flex;
		align-items: baseline;
		gap: var(--s2);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		transform: translateY(-1px);
	}
	.dot.danger {
		background: var(--danger-ink);
	}
	.dot.warn {
		background: var(--lamp);
	}
	@media (max-width: 760px) {
		.tr {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--s1);
		}
		.tr.head {
			display: none;
		}
	}

	.trust {
		padding: var(--s6) 0 0;
	}
	.trust-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 2.4fr);
		gap: var(--s5);
		border-top: 1px solid var(--line);
		padding-top: var(--s6);
	}
	.trust p {
		font-size: 17px;
		color: var(--ink-2);
		max-width: 62ch;
	}
	@media (max-width: 760px) {
		.trust-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
