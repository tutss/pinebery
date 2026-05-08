<script lang="ts">
  import { onMount } from 'svelte'
  import type { NodeId, Panel } from '../../shared/types'
  import { moveToPanelRequest, togglePinRequest } from '../stores/tree.svelte'

  interface Props {
    nodeId: NodeId
    nodePanelId: string
    nodePinned: boolean
    panels: Panel[]
    x: number
    y: number
    onClose: () => void
  }

  const { nodeId, nodePanelId, nodePinned, panels, x, y, onClose }: Props = $props()

  let menuEl: HTMLDivElement | null = $state(null)

  const otherPanels = $derived(panels.filter((p) => p.id !== nodePanelId))

  function handleMove(targetPanelId: string, event: MouseEvent) {
    const moveSubtree = !event.shiftKey
    moveToPanelRequest(nodeId, targetPanelId, moveSubtree)
    onClose()
  }

  function handleTogglePin() {
    togglePinRequest(nodeId)
    onClose()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (menuEl && !menuEl.contains(event.target as Node)) {
      onClose()
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="context-menu"
  bind:this={menuEl}
  style="top: {y}px; left: {x}px"
  onkeydown={handleKeydown}
  role="menu"
  tabindex="-1"
>
  <button type="button" class="menu-item" role="menuitem" onclick={handleTogglePin}>
    <span class="menu-icon">{nodePinned ? '📍' : '📌'}</span>
    {nodePinned ? 'Unpin tab' : 'Pin tab'}
  </button>
  {#if otherPanels.length > 0}
    <div class="separator"></div>
    {#each otherPanels as panel (panel.id)}
      <button
        type="button"
        class="menu-item"
        role="menuitem"
        onclick={(e) => handleMove(panel.id, e)}
      >
        <span class="menu-icon">{panel.icon}</span>
        Move to {panel.name}
      </button>
    {/each}
    <div class="hint">Shift+click to move without subtree</div>
  {/if}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 160px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--fg);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .menu-item:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .menu-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .separator {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }

  .menu-icon {
    font-size: 13px;
  }

  .hint {
    padding: 4px 12px 2px;
    font-size: 10px;
    color: var(--fg-muted);
    border-top: 1px solid var(--border);
    margin-top: 2px;
  }
</style>
