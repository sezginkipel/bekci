<script lang="ts">
	import '../app.css';
	import { t } from '$lib/i18n';

	let { data, children } = $props();
	const L = $derived(data.lang);
	const other = $derived(L === 'en' ? 'tr' : 'en');
</script>

<svelte:head>
	<meta property="og:site_name" content="Bekçi" />
</svelte:head>

<header class="top">
	<div class="wrap bar">
		<a class="mark" href="/" aria-label="Bekçi">
			<span class="lamp" aria-hidden="true"></span>
			<span class="word">Bekçi</span>
		</a>
		<nav>
			{#if data.path !== '/'}
				<a class="navlink" href="/">{t(L, 'nav.home')}</a>
			{:else}
				<a class="navlink" href="#watch">{t(L, 'nav.how')}</a>
			{/if}
			<a class="lang" href="?lang={other}" hreflang={other} data-sveltekit-reload>{other.toUpperCase()}</a>
		</nav>
	</div>
</header>

<main>
	{@render children()}
</main>

<footer class="foot">
	<div class="wrap cols">
		<div>
			<div class="word small">Bekçi</div>
			<p class="note">{t(L, 'footer.made')}</p>
		</div>
		<p class="note">{t(L, 'footer.data')}</p>
	</div>
</footer>

<style>
	.top {
		border-bottom: 1px solid var(--line);
		background: var(--bg);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 60px;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		text-decoration: none;
	}
	.word {
		font-weight: 700;
		font-size: 19px;
		letter-spacing: -0.02em;
	}
	.word.small {
		font-size: 16px;
		margin-bottom: var(--s1);
	}
	/* The lantern: the only warm colour in the product. */
	.lamp {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--lamp);
		box-shadow: 0 0 0 4px rgb(242 184 75 / 0.22);
	}
	nav {
		display: flex;
		align-items: center;
		gap: var(--s4);
	}
	.navlink {
		color: var(--ink-2);
		text-decoration: none;
		font-size: 15px;
		padding: 10px 4px;
	}
	.navlink:hover {
		color: var(--ink);
	}
	.lang {
		font-family: var(--mono);
		font-size: 12px;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
		border: 1px solid var(--line-2);
		border-radius: var(--pill);
		padding: 8px 12px;
	}
	.lang:hover {
		background: var(--bg-2);
	}
	main {
		min-height: calc(100dvh - 60px - 140px);
	}
	.foot {
		border-top: 1px solid var(--line);
		margin-top: var(--s8);
		padding: var(--s6) 0 var(--s7);
		background: var(--bg-2);
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
		gap: var(--s5);
		align-items: start;
	}
	@media (max-width: 720px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
