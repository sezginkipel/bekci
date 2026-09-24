<script lang="ts">
	import type { Severity } from '$lib/engine/types';

	let { severity, label }: { severity: Severity; label: string } = $props();
</script>

<span class="stamp {severity}">{label}</span>

<style>
	.stamp {
		display: inline-block;
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 2px 8px;
		border-radius: 4px;
		border: 1px solid;
		line-height: 1.6;
		white-space: nowrap;
	}
	.danger {
		background: var(--danger);
		color: var(--danger-ink);
		border-color: var(--danger-edge);
	}
	.warn {
		background: var(--warn);
		color: var(--warn-ink);
		border-color: var(--warn-edge);
	}
	.info {
		background: var(--info);
		color: var(--info-ink);
		border-color: var(--line);
	}
	.ok {
		background: var(--ok);
		color: var(--ok-ink);
		border-color: var(--ok-edge);
	}
</style>
