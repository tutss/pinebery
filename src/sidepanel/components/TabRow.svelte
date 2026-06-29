<script lang="ts">
  import { isFolder, type TreeNode } from '../../shared/types'
  import {
    activateTab,
    closeNodeRequest,
    toggleCollapseRequest,
    treeStore,
  } from '../stores/tree.svelte'
  import Favicon from './Favicon.svelte'

  interface Props {
    node: TreeNode
    depth: number
    matches?: boolean
    groupColor?: string | null
    isActive?: boolean
    isDropParent?: boolean
    onDragStart?: (event: DragEvent, nodeId: string) => void
    onDragEnd?: (event: DragEvent) => void
  }

  let {
    node,
    depth,
    matches = true,
    groupColor = null,
    isActive = false,
    isDropParent = false,
    onDragStart,
    onDragEnd,
  }: Props = $props()

  const folder = $derived(isFolder(node))
  const accentColor = $derived(groupColor ?? 'transparent')
  const guideLevels = $derived(Array.from({ length: depth }, (_, level) => level))
  const hasChildren = $derived(node.childIds.length > 0)
  const chevronLabel = $derived(node.collapsed ? 'expand' : 'collapse')
  const displayTitle = $derived(node.customTitle ?? node.title)
  const rowTooltip = $derived(
    folder
      ? displayTitle
      : node.customTitle
        ? `${node.title} — ${node.url}`
        : node.url,
  )

  function handleRowClick() {
    // A folder has no tab to activate; clicking it folds/unfolds its contents.
    if (folder) {
      toggleCollapseRequest(node.id)
    } else {
      activateTab(node.id)
    }
  }

  function handleClose(event: MouseEvent) {
    event.stopPropagation()
    const defaultMode = treeStore.state?.settings.defaultCloseBehavior ?? 'promote'
    const inverted = defaultMode === 'promote' ? 'subtree' : 'promote'
    const mode = event.shiftKey ? inverted : defaultMode
    closeNodeRequest(node.id, mode)
  }

  function handleToggleCollapse(event: MouseEvent) {
    event.stopPropagation()
    toggleCollapseRequest(node.id)
  }

  function handleDragStart(event: DragEvent) {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/pinebery-node', node.id)
    }
    onDragStart?.(event, node.id)
  }

  function handleDragEnd(event: DragEvent) {
    onDragEnd?.(event)
  }
</script>

<div
  class="row"
  class:dimmed={!matches}
  class:grouped={groupColor !== null}
  class:active={isActive}
  class:drop-parent={isDropParent}
  style="--depth: {depth}; border-left-color: {accentColor}"
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  role="button"
  tabindex="0"
  onclick={handleRowClick}
  onkeydown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleRowClick()
    }
  }}
  title={rowTooltip}
>
  {#each guideLevels as level (level)}
    <span
      class="guide"
      style="left: calc(8px + {level} * var(--indent-px) + 7px)"
      aria-hidden="true"
    ></span>
  {/each}

  {#if hasChildren}
    <button
      type="button"
      class="chevron"
      class:collapsed={node.collapsed}
      onclick={handleToggleCollapse}
      aria-label={chevronLabel}
      tabindex="-1"
    >
      ▸
    </button>
  {:else}
    <span class="chevron-spacer" aria-hidden="true"></span>
  {/if}

  {#if folder}
    <span class="folder-icon" aria-hidden="true">{node.collapsed ? '📁' : '📂'}</span>
  {:else}
    <Favicon favIconUrl={node.favIconUrl} pageUrl={node.url ?? ''} />
  {/if}

  <span class="title" class:folder-title={folder}>{displayTitle || node.url || 'Loading...'}</span>

  {#if node.audible}
    <span class="audio-indicator" aria-label="playing audio">♪</span>
  {/if}

  <button
    type="button"
    class="close"
    onclick={handleClose}
    aria-label={folder ? 'delete folder (shift to close contents)' : 'close tab (shift for subtree)'}
    tabindex="-1"
  >
    ×
  </button>
</div>

<style>
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: var(--row-padding-v) 8px;
    padding-left: calc(8px + var(--depth, 0) * var(--indent-px));
    border: none;
    border-left: 3px solid transparent;
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
    border-radius: 0 4px 4px 0;
    box-sizing: border-box;
    user-select: none;
  }

  .guide {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--tree-guide);
    pointer-events: none;
  }


  .row:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .row.dimmed {
    opacity: 0.45;
  }

  .row.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .row.active .title {
    font-weight: 600;
  }

  .row.active:hover {
    background: color-mix(in srgb, var(--accent) 24%, transparent);
  }

  .row.drop-parent {
    box-shadow: inset 0 0 0 1px var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .chevron,
  .chevron-spacer {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .chevron {
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 10px;
    padding: 0;
    border-radius: 2px;
    transform: rotate(90deg);
    transition: transform 0.1s ease;
  }

  .chevron.collapsed {
    transform: rotate(0deg);
  }

  .chevron:hover {
    color: var(--fg);
  }

  .title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--row-font-size);
  }

  .title.folder-title {
    font-weight: 600;
    color: var(--fg-muted);
  }

  .folder-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    line-height: 1;
  }

  .audio-indicator {
    flex-shrink: 0;
    color: var(--accent);
    font-size: 12px;
  }

  .close {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    border-radius: 3px;
    padding: 0;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .row:hover .close {
    opacity: 1;
  }

  .close:hover {
    background: color-mix(in srgb, var(--fg) 15%, transparent);
    color: var(--fg);
  }
</style>
