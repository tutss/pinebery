<script lang="ts">
  interface Props {
    visible: boolean
    topPx: number
    depth: number
    indentPx: number
    leftOffsetPx: number
  }

  let { visible, topPx, depth, indentPx, leftOffsetPx }: Props = $props()

  const leftPx = $derived(leftOffsetPx + depth * indentPx)
</script>

{#if visible}
  <div
    class="drop-indicator"
    style="top: {topPx}px; left: {leftPx}px;"
  ></div>
{/if}

<style>
  .drop-indicator {
    position: absolute;
    right: 8px;
    height: 2px;
    background: var(--accent);
    pointer-events: none;
    z-index: 10;
    border-radius: 1px;
  }

  .drop-indicator::before {
    content: '';
    position: absolute;
    left: -4px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
</style>
