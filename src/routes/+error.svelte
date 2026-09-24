<script lang="ts">
	import { page } from '$app/state';
	import { t, type Lang } from '$lib/i18n';

	const L = $derived(((page.data as { lang?: Lang }).lang ?? 'en') as Lang);
</script>

<svelte:head>
	<title>{t(L, 'err.title')} · Bekçi</title>
</svelte:head>

<section class="wrap msg">
	<p class="eyebrow mono">{page.status}</p>
	<h1>{t(L, 'err.title')}</h1>
	<p>{page.error?.message ?? t(L, 'err.rpc')}</p>
	<div class="acts">
		{#if page.status === 503}
			<button class="btn btn-primary" type="button" onclick={() => location.reload()}>{t(L, 'report.rescan')}</button>
		{/if}
		<a class="btn btn-quiet" href="/">{t(L, 'err.back')}</a>
	</div>
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
	.acts {
		display: flex;
		gap: var(--s2);
		flex-wrap: wrap;
	}
</style>
