<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import type { TreeNode } from '../../shared/types'
  import { renameTabRequest } from '../stores/tree.svelte'

  interface Props {
    node: TreeNode
    anchorRect: DOMRect
    onClose: () => void
  }

  const { node, anchorRect, onClose }: Props = $props()

  let popoverEl: HTMLDivElement | null = $state(null)
  let inputEl: HTMLInputElement | null = $state(null)
  let nameValue = $state(untrack(() => node.customTitle ?? node.title))

  const originalTitle = $derived(node.title)
  const hasCustomTitle = $derived(node.customTitle !== undefined)

  function commit() {
    const trimmed = nameValue.trim()
    const next: string | null = trimmed === '' || trimmed === originalTitle ? null : trimmed
    const current = node.customTitle ?? null
    if (next !== current) {
      renameTabRequest(node.id, next)
    }
    onClose()
  }

  function cancel() {
    onClose()
  }

  function resetToOriginal() {
    if (hasCustomTitle) {
      renameTabRequest(node.id, null)
    }
    onClose()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (popoverEl && !popoverEl.contains(event.target as Node)) {
      cancel()
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', handleClickOutside)
    void tick().then(() => {
      inputEl?.focus()
      inputEl?.select()
    })
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
  aria-label="Rename tab"
  tabindex="-1"
>
  <label class="field">
    <span class="label">Tab name</span>
    <input
      bind:this={inputEl}
      type="text"
      bind:value={nameValue}
      placeholder={originalTitle}
    />
    <span class="hint">Enter saves. Empty restores the original.</span>
  </label>

  <div class="actions">
    <button type="button" class="btn" onclick={cancel}>Cancel</button>
    {#if hasCustomTitle}
      <button type="button" class="btn" onclick={resetToOriginal}>Reset</button>
    {/if}
    <button type="button" class="btn primary" onclick={commit}>Save</button>
  </div>
</div>

<style>
  .popover {
    position: fixed;
    z-index: 100;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    width: 260px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-size: 11px;
    color: var(--fg-muted);
    font-weight: 500;
  }

  input {
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    outline: none;
  }

  input:focus {
    border-color: var(--accent);
  }

  .hint {
    font-size: 10px;
    color: var(--fg-muted);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }

  .btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--fg);
    cursor: pointer;
  }

  .btn:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .btn.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  .btn.primary:hover {
    background: color-mix(in srgb, var(--accent) 85%, #000);
  }
</style>
