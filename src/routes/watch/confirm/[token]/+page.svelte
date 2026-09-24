<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import Addr from '$lib/components/Addr.svelte';

	let { data, form } = $props();
	const L = $derived(data.lang);
	const started = $derived(form?.started || data.state === 'active');
	let busy = $state(false);
</script>

<svelte:head>
	<title>{t(L, started ? 'confirm.title' : 'confirm.pending')} · Bekçi</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="wrap msg">
	{#if data.state === 'bad' || form?.bad}
		<h1>{t(L, 'err.title')}</h1>
		<p>{t(L, 'confirm.bad')}</p>
		<a class="btn btn-quiet" href="/">{t(L, 'err.back')}</a>
	{:else if started}
		<p class="eyebrow">{t(L, 'report.title')}</p>
		<h1>{t(L, 'confirm.title')}</h1>
		<p>{t(L, 'confirm.body', { email: data.email ?? '' })}</p>
		<p class="big"><Addr value={data.address ?? ''} /></p>
		<a class="btn btn-primary" href="/w/{data.address}">{t(L, 'confirm.open')}</a>
	{:else}
		<p class="eyebrow">{t(L, 'report.title')}</p>
		<h1>{t(L, 'confirm.pending')}</h1>
		<p>{t(L, 'confirm.pending.body', { email: data.email ?? '' })}</p>
		<p class="big"><Addr value={data.address ?? ''} /></p>
		<form
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<button class="btn btn-primary" disabled={busy}>{t(L, 'hero.submit')}</button>
		</form>
	{/if}
</section>

<style>
	.msg {
		padding-top: var(--s8);
		max-width: 720px;
		display: grid;
		gap: var(--s4);
		justify-items: start;
	}
	h1 {
		font-size: clamp(32px, 5vw, 52px);
	}
	p {
		color: var(--ink-2);
		font-size: 17px;
	}
	.big {
		font-size: 16px;
		color: var(--ink);
	}
</style>
