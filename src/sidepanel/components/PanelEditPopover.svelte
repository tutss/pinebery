<script lang="ts">
  import { onMount } from 'svelte'
  import type { Panel, GroupColor } from '../../shared/types'
  import { GROUP_COLOR_MAP } from '../group-colors'
  import { updatePanelRequest, deletePanelRequest } from '../stores/tree.svelte'

  interface Props {
    panel: Panel
    anchorRect: DOMRect
    canDelete: boolean
    onClose: () => void
  }

  const { panel, anchorRect, canDelete, onClose }: Props = $props()

  let popoverEl: HTMLDivElement | null = $state(null)
  let nameValue = $state('')
  let iconValue = $state('')
  let confirmingDelete = $state(false)

  $effect(() => {
    nameValue = panel.name
    iconValue = panel.icon
  })

  const colorEntries = Object.entries(GROUP_COLOR_MAP) as [GroupColor, string][]

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
  const emojiHint = isMac ? 'Cmd+Ctrl+Space for emoji' : 'Win+. for emoji'

  function handleNameChange() {
    if (nameValue !== panel.name) {
      updatePanelRequest(panel.id, { name: nameValue })
    }
  }

  function handleIconChange() {
    const trimmed = iconValue.trim()
    if (trimmed && trimmed !== panel.icon) {
      updatePanelRequest(panel.id, { icon: trimmed })
    }
  }

  function handleColorClick(color: GroupColor) {
    updatePanelRequest(panel.id, { color })
  }

  function handleDelete() {
    if (!confirmingDelete) {
      confirmingDelete = true
      return
    }
    deletePanelRequest(panel.id)
    onClose()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose()
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (popoverEl && !popoverEl.contains(event.target as Node)) {
      onClose()
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  })

  const topPx = $derived(anchorRect.bottom + 4)
  const leftPx = $derived(Math.max(4, anchorRect.left))
</script>

<div
  class="popover"
  bind:this={popoverEl}
  style="top: {topPx}px; left: {leftPx}px"
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
>
  <label class="field">
    <span class="label">Name</span>
    <input
      type="text"
      bind:value={nameValue}
      onblur={handleNameChange}
      onkeydown={(e) => { if (e.key === 'Enter') handleNameChange() }}
    />
  </label>

  <label class="field">
    <span class="label">Icon</span>
    <input
      type="text"
      class="icon-input"
      bind:value={iconValue}
      onblur={handleIconChange}
      onkeydown={(e) => { if (e.key === 'Enter') handleIconChange() }}
    />
    <span class="hint">{emojiHint}</span>
  </label>

  <div class="field">
    <span class="label">Color</span>
    <div class="swatches">
      {#each colorEntries as [color, hex]}
        <button
          type="button"
          class="swatch"
          class:active={panel.color === color}
          style="background: {hex}"
          onclick={() => handleColorClick(color)}
          aria-label={color}
        ></button>
      {/each}
    </div>
  </div>

  {#if canDelete}
    <div class="delete-section">
      <button type="button" class="delete-btn" onclick={handleDelete}>
        {confirmingDelete ? 'Confirm delete' : 'Delete panel'}
      </button>
      {#if confirmingDelete}
        <span class="delete-hint">All tabs will be closed</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .popover {
    position: fixed;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    width: 220px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .label {
    font-size: 11px;
    color: var(--fg-muted);
    font-weight: 500;
  }

  input {
    font: inherit;
    font-size: 13px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  .icon-input {
    width: 40px;
    text-align: center;
    font-size: 16px;
  }

  .hint {
    font-size: 10px;
    color: var(--fg-muted);
  }

  .swatches {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
  }

  .swatch.active {
    border-color: var(--fg);
  }

  .swatch:hover {
    opacity: 0.8;
  }

  .swatch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .delete-section {
    border-top: 1px solid var(--border);
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .delete-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: #ea4335;
    cursor: pointer;
  }

  .delete-btn:hover {
    background: rgba(234, 67, 53, 0.08);
  }

  .delete-hint {
    font-size: 10px;
    color: #ea4335;
  }
</style>
