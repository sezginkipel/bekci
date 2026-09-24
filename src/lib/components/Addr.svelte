<script lang="ts">
	import { splitEdges } from '$lib/engine/address';

	let { value, n = 4, full = true }: { value: string; n?: number; full?: boolean } = $props();
	const parts = $derived(splitEdges(value, n));
</script>

<span class="addr" title={value}
	><span class="edge">{parts[0]}</span>{#if full}<span class="mid">{parts[1]}</span>{:else}<span class="mid">…</span>{/if}<span class="edge">{parts[2]}</span></span
>
