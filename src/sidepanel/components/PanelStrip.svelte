<script lang="ts">
  import { tick } from 'svelte'
  import type { Panel, PanelId } from '../../shared/types'
  import { resolveGroupColor } from '../group-colors'
  import {
    treeStore,
    dragState,
    setActivePanel,
    createPanelRequest,
    reorderPanelsRequest,
    moveToPanelRequest,
    getPanelsForCurrentWindow,
    getPanelById,
  } from '../stores/tree.svelte'
  import PanelEditPopover from './PanelEditPopover.svelte'

  const panels = $derived(getPanelsForCurrentWindow())

  let editingPanelId: PanelId | null = $state(null)
  let editAnchorRect: DOMRect | null = $state(null)
  let draggedPanelId: PanelId | null = $state(null)
  let dragOverPanelId: PanelId | null = $state(null)

  const editingPanel = $derived(getPanelById(editingPanelId))

  function handlePanelClick(panel: Panel) {
    setActivePanel(panel.id)
  }

  function handleContextMenu(event: MouseEvent, panel: Panel) {
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    editAnchorRect = target.getBoundingClientRect()
    editingPanelId = panel.id
  }

  async function handleAdd() {
    const newPanelId = await createPanelRequest()
    if (!newPanelId) return
    setActivePanel(newPanelId)
    await tick()
    const buttons = document.querySelectorAll<HTMLElement>('.panel-strip .panel-btn')
    const lastBtn = buttons[buttons.length - 1]
    if (lastBtn) {
      editAnchorRect = lastBtn.getBoundingClientRect()
      editingPanelId = newPanelId
    }
  }

  function closePopover() {
    editingPanelId = null
    editAnchorRect = null
  }

  function handlePanelDragStart(event: DragEvent, panelId: PanelId) {
    draggedPanelId = panelId
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/pinebery-panel', panelId)
    }
  }

  function handlePanelDragEnd() {
    draggedPanelId = null
    dragOverPanelId = null
  }

  function handlePanelDragOver(event: DragEvent, panelId: PanelId) {
    if (draggedPanelId !== null || dragState.nodeId !== null) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      dragOverPanelId = panelId
    }
  }

  function handlePanelDragLeave(panelId: PanelId) {
    if (dragOverPanelId === panelId) dragOverPanelId = null
  }

  function handlePanelDrop(event: DragEvent, targetPanelId: PanelId) {
    event.preventDefault()
    dragOverPanelId = null

    const panelData = event.dataTransfer?.getData('text/pinebery-panel')
    if (panelData && draggedPanelId) {
      const currentOrder = panels.map((p) => p.id)
      const fromIndex = currentOrder.indexOf(draggedPanelId)
      const toIndex = currentOrder.indexOf(targetPanelId)
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const newOrder = [...currentOrder]
        newOrder.splice(fromIndex, 1)
        newOrder.splice(toIndex, 0, draggedPanelId)
        reorderPanelsRequest(newOrder)
      }
      draggedPanelId = null
      return
    }

    const nodeId = event.dataTransfer?.getData('text/pinebery-node') || dragState.nodeId
    if (nodeId) {
      const moveSubtree = !event.shiftKey
      moveToPanelRequest(nodeId, targetPanelId, moveSubtree)
    }
  }
</script>

<div class="panel-strip">
  {#each panels as panel (panel.id)}
    <button
      type="button"
      class="panel-btn"
      class:active={treeStore.activePanelId === panel.id}
      class:drop-target={dragOverPanelId === panel.id}
      style="--panel-color: {resolveGroupColor(panel.color) ?? 'var(--fg-muted)'}"
      title={panel.name}
      draggable="true"
      onclick={() => handlePanelClick(panel)}
      oncontextmenu={(e) => handleContextMenu(e, panel)}
      ondragstart={(e) => handlePanelDragStart(e, panel.id)}
      ondragend={handlePanelDragEnd}
      ondragover={(e) => handlePanelDragOver(e, panel.id)}
      ondragleave={() => handlePanelDragLeave(panel.id)}
      ondrop={(e) => handlePanelDrop(e, panel.id)}
    >
      <span class="panel-icon">{panel.icon}</span>
    </button>
  {/each}
  <button type="button" class="add-btn" onclick={handleAdd} title="New panel">
    +
  </button>
</div>

{#if editingPanel && editAnchorRect}
  <PanelEditPopover
    panel={editingPanel}
    anchorRect={editAnchorRect}
    canDelete={panels.length > 1}
    onClose={closePopover}
  />
{/if}

<style>
  .panel-strip {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .panel-strip::-webkit-scrollbar {
    height: 3px;
  }

  .panel-strip::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 2px;
  }

  .panel-btn {
    position: relative;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel-btn::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 4px;
    right: 4px;
    height: 2px;
    border-radius: 1px;
    background: transparent;
  }

  .panel-btn.active::after {
    background: var(--panel-color);
  }

  .panel-btn:hover {
    background: color-mix(in srgb, var(--fg) 8%, transparent);
  }

  .panel-btn.drop-target {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }

  .panel-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .panel-icon {
    font-size: 14px;
    line-height: 1;
  }

  .add-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: 1px dashed var(--border);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    border-radius: 4px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-btn:hover {
    border-color: var(--fg-muted);
    color: var(--fg);
    background: color-mix(in srgb, var(--fg) 6%, transparent);
  }

  .add-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
