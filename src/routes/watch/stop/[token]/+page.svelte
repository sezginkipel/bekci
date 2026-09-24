<script lang="ts">
	import { t } from '$lib/i18n';
	import Addr from '$lib/components/Addr.svelte';

	let { data } = $props();
	const L = $derived(data.lang);
</script>

<svelte:head>
	<title>{t(L, data.ok ? 'stop.title' : 'err.title')} · Bekçi</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<section class="wrap msg">
	{#if data.ok}
		<h1>{t(L, 'stop.title')}</h1>
		<p>{t(L, 'stop.body')}</p>
		<p class="big"><Addr value={data.address} /></p>
		<a class="btn btn-quiet" href="/w/{data.address}">{t(L, 'confirm.open')}</a>
	{:else}
		<h1>{t(L, 'err.title')}</h1>
		<p>{t(L, 'confirm.bad')}</p>
		<a class="btn btn-quiet" href="/">{t(L, 'err.back')}</a>
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
