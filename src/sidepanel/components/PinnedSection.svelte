<script lang="ts">
  import type { TreeNode } from '../../shared/types'
  import { activateTab } from '../stores/tree.svelte'
  import Favicon from './Favicon.svelte'

  interface Props {
    nodes: TreeNode[]
  }

  let { nodes }: Props = $props()
</script>

{#if nodes.length > 0}
  <div class="pinned">
    {#each nodes as node (node.id)}
      <button
        type="button"
        class="tile"
        title={node.title || node.url}
        onclick={() => activateTab(node.id)}
      >
        <Favicon favIconUrl={node.favIconUrl} pageUrl={node.url ?? ''} />
      </button>
    {/each}
  </div>
{/if}

<style>
  .pinned {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--pinned-tile-size);
    height: var(--pinned-tile-size);
    padding: 4px;
    border: none;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    box-sizing: border-box;
  }

  .tile:hover {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
  }

  .tile:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .tile :global(.favicon) {
    width: var(--pinned-favicon-size);
    height: var(--pinned-favicon-size);
    border-radius: 2px;
  }

  .tile :global(.favicon.placeholder) {
    background: color-mix(in srgb, var(--fg) 15%, transparent);
  }
</style>
