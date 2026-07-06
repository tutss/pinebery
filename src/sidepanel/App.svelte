<script lang="ts">
  import { onMount } from 'svelte'
  import TabRow from './components/TabRow.svelte'
  import Filter from './components/Filter.svelte'
  import PinnedSection from './components/PinnedSection.svelte'
  import PanelStrip from './components/PanelStrip.svelte'
  import TabContextMenu from './components/TabContextMenu.svelte'
  import TabRenamePopover from './components/TabRenamePopover.svelte'
  import DropIndicator from './components/DropIndicator.svelte'
  import {
    initializeTreeStore,
    treeStore,
    dragState,
    getRenderedEntries,
    getNodeById,
    moveNodeRequest,
    closeNodeRequest,
    getPanelsForCurrentWindow,
    createFolderRequest,
  } from './stores/tree.svelte'
  import { filterRenderEntries, type FilteredEntry } from './filter'
  import { computeDropTarget, type RowLayout } from './dnd/indent-dnd'
  import { resolveGroupColor } from './group-colors'
  import { DEFAULT_SETTINGS, isFolder, type NodeId, type RenderEntry, type TreeNode } from '../shared/types'

  const LIST_LEFT_OFFSET = 8

  let filterQuery = $state('')
  let listEl: HTMLDivElement | null = $state(null)

  let dropIndicator = $state({
    visible: false,
    topPx: 0,
    depth: 0,
    prospectiveParentId: null as NodeId | null,
  })

  let dragDepth: number | null = $state(null)

  let contextMenu = $state<{
    nodeId: string
    nodePanelId: string
    nodePinned: boolean
    nodeIsFolder: boolean
    hasCustomTitle: boolean
    x: number
    y: number
  } | null>(null)

  let renamePopover = $state<{
    nodeId: string
    anchorRect: DOMRect
  } | null>(null)

  function handleTabContextMenu(
    event: MouseEvent,
    nodeId: string,
    nodePanelId: string,
    nodePinned: boolean,
    nodeIsFolder: boolean,
    hasCustomTitle: boolean,
  ) {
    event.preventDefault()
    contextMenu = {
      nodeId,
      nodePanelId,
      nodePinned,
      nodeIsFolder,
      hasCustomTitle,
      x: event.clientX,
      y: event.clientY,
    }
  }

  async function handleNewFolder() {
    await createFolderRequest(null)
  }

  function openRenamePopoverForNode(nodeId: string) {
    if (!listEl) return
    const wrapper = listEl.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
    const rowEl = wrapper?.querySelector<HTMLElement>('.row') ?? wrapper
    if (!rowEl) return
    renamePopover = { nodeId, anchorRect: rowEl.getBoundingClientRect() }
  }

  onMount(() => {
    void initializeTreeStore()
  })

  const settings = $derived(treeStore.state?.settings ?? DEFAULT_SETTINGS)
  const indentPx = $derived(settings.density === 'compact' ? 12 : 16)

  $effect(() => {
    const root = document.documentElement
    root.classList.remove('theme-light', 'theme-dark')
    if (settings.theme === 'light') {
      root.classList.add('theme-light')
    } else if (settings.theme === 'dark') {
      root.classList.add('theme-dark')
    }
    root.classList.toggle('density-compact', settings.density === 'compact')
  })

  function handleListKeydown(event: KeyboardEvent) {
    if (!listEl) return
    const rows = Array.from(
      listEl.querySelectorAll<HTMLElement>('[data-node-id] > .row'),
    )
    if (rows.length === 0) return

    const activeHost = (event.target as HTMLElement).closest<HTMLElement>('.row')
    const currentIndex = activeHost ? rows.indexOf(activeHost) : -1

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, rows.length - 1)
      rows[nextIndex]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      const nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
      rows[nextIndex]?.focus()
    } else if (event.key === 'F2' && currentIndex >= 0 && activeHost) {
      event.preventDefault()
      const nodeId = activeHost.parentElement?.dataset['nodeId']
      if (nodeId) openRenamePopoverForNode(nodeId)
    } else if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      currentIndex >= 0 &&
      activeHost
    ) {
      event.preventDefault()
      const nodeId = activeHost.parentElement?.dataset['nodeId']
      if (!nodeId) return
      const defaultMode = settings.defaultCloseBehavior
      const inverted: typeof defaultMode = defaultMode === 'promote' ? 'subtree' : 'promote'
      const mode = event.shiftKey ? inverted : defaultMode
      const nextFocusIndex = Math.min(currentIndex, rows.length - 2)
      closeNodeRequest(nodeId, mode)
      if (nextFocusIndex >= 0) {
        queueMicrotask(() => {
          const refreshed = Array.from(
            listEl?.querySelectorAll<HTMLElement>('[data-node-id] > .row') ?? [],
          )
          refreshed[nextFocusIndex]?.focus()
        })
      }
    }
  }

  interface SplitResult {
    pinnedNodes: TreeNode[]
    unpinnedEntries: RenderEntry[]
  }

  function splitPinned(entries: RenderEntry[]): SplitResult {
    const unpinnedEntries: RenderEntry[] = []
    let insidePinnedRoot = false
    for (const entry of entries) {
      if (entry.depth === 0) {
        const node = getNodeById(entry.nodeId)
        if (node?.pinned) {
          insidePinnedRoot = true
          continue
        }
        insidePinnedRoot = false
      }
      if (!insidePinnedRoot) {
        unpinnedEntries.push(entry)
      }
    }
    return { pinnedNodes: collectPinnedNodes(), unpinnedEntries }
  }

  function collectPinnedNodes(): TreeNode[] {
    if (!treeStore.state || treeStore.currentWindowId === null) return []
    const windowId = treeStore.currentWindowId
    const nodes = treeStore.state.nodesByWindow[windowId] ?? {}
    const scope = treeStore.state.settings.pinnedScope
    const panelIds =
      scope === 'window'
        ? (treeStore.state.panelOrderByWindow[windowId] ?? [])
        : [treeStore.activePanelId]
    const result: TreeNode[] = []
    for (const panelId of panelIds) {
      const roots = treeStore.state.rootOrderByWindow[windowId]?.[panelId] ?? []
      for (const id of roots) {
        const n = nodes[id]
        if (n?.pinned) result.push(n)
      }
    }
    return result
  }

  const allEntries = $derived(treeStore.isReady ? getRenderedEntries() : [])
  const split = $derived(splitPinned(allEntries))

  function groupColorForNode(node: TreeNode): string | null {
    if (node.groupId === undefined || !treeStore.state) return null
    const bucket = treeStore.state.groupsByWindow[node.windowId]
    const group = bucket?.[node.groupId]
    return resolveGroupColor(group?.color)
  }
  const filteredEntries: FilteredEntry[] = $derived.by(() => {
    if (!treeStore.state || treeStore.currentWindowId === null) return []
    return filterRenderEntries(
      split.unpinnedEntries,
      treeStore.state,
      treeStore.currentWindowId,
      filterQuery,
    )
  })

  // Row layouts and drag cursor positions are both expressed in the list's
  // content coordinates (scroll-adjusted). The drop indicator is absolutely
  // positioned inside the scrolling list, so its `top` lives in content
  // space too — using viewport-relative offsets here made the indicator
  // drift by scrollTop whenever the list was scrolled.
  function collectRowLayouts(): RowLayout[] {
    if (!listEl) return []
    const listRect = listEl.getBoundingClientRect()
    const scrollTop = listEl.scrollTop
    const rows: RowLayout[] = []
    const children = listEl.querySelectorAll<HTMLElement>('[data-node-id]')
    children.forEach((child) => {
      const rect = child.getBoundingClientRect()
      const nodeId = child.dataset['nodeId']
      const depthStr = child.dataset['depth']
      if (!nodeId) return
      rows.push({
        nodeId,
        topPx: rect.top - listRect.top + scrollTop,
        bottomPx: rect.bottom - listRect.top + scrollTop,
        depth: Number(depthStr ?? '0'),
      })
    })
    return rows
  }

  function handleRowDragStart(_event: DragEvent, nodeId: string) {
    dragState.nodeId = nodeId
    dragDepth = null
  }

  function handleRowDragEnd() {
    dragState.nodeId = null
    dragDepth = null
    dropIndicator.visible = false
  }

  function handleDragOver(event: DragEvent) {
    if (
      !dragState.nodeId ||
      !listEl ||
      !treeStore.state ||
      treeStore.currentWindowId === null
    ) {
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'

    const listRect = listEl.getBoundingClientRect()
    const cursorY = event.clientY - listRect.top + listEl.scrollTop
    const cursorX = event.clientX - listRect.left - LIST_LEFT_OFFSET

    const target = computeDropTarget({
      rowLayouts: collectRowLayouts(),
      state: treeStore.state,
      windowId: treeStore.currentWindowId,
      panelId: treeStore.activePanelId,
      draggedNodeId: dragState.nodeId,
      cursorY,
      cursorX,
      indentPx: indentPx,
      ...(dragDepth !== null ? { previousDepth: dragDepth } : {}),
    })

    if (target) {
      dragDepth = target.indicatorDepth
      dropIndicator = {
        visible: true,
        topPx: target.indicatorY,
        depth: target.indicatorDepth,
        prospectiveParentId: target.newParentId,
      }
    } else {
      dropIndicator.visible = false
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (event.currentTarget === event.target) {
      dropIndicator.visible = false
    }
  }

  function handleDrop(event: DragEvent) {
    if (
      !dragState.nodeId ||
      !listEl ||
      !treeStore.state ||
      treeStore.currentWindowId === null
    ) {
      return
    }
    event.preventDefault()

    const listRect = listEl.getBoundingClientRect()
    const cursorY = event.clientY - listRect.top + listEl.scrollTop
    const cursorX = event.clientX - listRect.left - LIST_LEFT_OFFSET

    const target = computeDropTarget({
      rowLayouts: collectRowLayouts(),
      state: treeStore.state,
      windowId: treeStore.currentWindowId,
      panelId: treeStore.activePanelId,
      draggedNodeId: dragState.nodeId,
      cursorY,
      cursorX,
      indentPx: indentPx,
      ...(dragDepth !== null ? { previousDepth: dragDepth } : {}),
    })

    if (target) {
      moveNodeRequest(dragState.nodeId, target.newParentId, target.newIndex)
    }

    dropIndicator.visible = false
    dragState.nodeId = null
    dragDepth = null
  }
</script>

<main>
  <header>
    <h1>Pinebery</h1>
    <div class="header-actions">
      <button
        type="button"
        class="gear"
        onclick={handleNewFolder}
        aria-label="new folder"
        title="New folder"
      >
        📁
      </button>
      <button
        type="button"
        class="gear"
        onclick={() => chrome.runtime.openOptionsPage()}
        aria-label="settings"
      >
        ⚙
      </button>
    </div>
  </header>

  {#if !treeStore.isReady}
    <p class="status">Loading tree...</p>
  {:else}
    <PanelStrip />
    <PinnedSection nodes={split.pinnedNodes} />
    <Filter value={filterQuery} onChange={(next) => (filterQuery = next)} />

    {#if filteredEntries.length === 0}
      <p class="status">
        {filterQuery ? 'No matches.' : 'No tabs in this window.'}
      </p>
    {:else}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="list"
        bind:this={listEl}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
        onkeydown={handleListKeydown}
        role="list"
      >
        <DropIndicator
          visible={dropIndicator.visible}
          topPx={dropIndicator.topPx}
          depth={dropIndicator.depth}
          indentPx={indentPx}
          leftOffsetPx={LIST_LEFT_OFFSET}
        />
        {#each filteredEntries as { entry, matches } (entry.nodeId)}
          {@const node = getNodeById(entry.nodeId)}
          {#if node}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              data-node-id={entry.nodeId}
              data-depth={entry.depth}
              oncontextmenu={(e) =>
                handleTabContextMenu(
                  e,
                  entry.nodeId,
                  node.panelId,
                  node.pinned,
                  isFolder(node),
                  node.customTitle !== undefined,
                )}
            >
              <TabRow
                {node}
                depth={entry.depth}
                {matches}
                groupColor={groupColorForNode(node)}
                isActive={node.tabId === treeStore.activeTabId}
                isDropParent={dropIndicator.visible &&
                  dropIndicator.prospectiveParentId === entry.nodeId}
                onDragStart={handleRowDragStart}
                onDragEnd={handleRowDragEnd}
              />
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

  {#if contextMenu}
    <TabContextMenu
      nodeId={contextMenu.nodeId}
      nodePanelId={contextMenu.nodePanelId}
      nodePinned={contextMenu.nodePinned}
      nodeIsFolder={contextMenu.nodeIsFolder}
      hasCustomTitle={contextMenu.hasCustomTitle}
      panels={getPanelsForCurrentWindow()}
      x={contextMenu.x}
      y={contextMenu.y}
      onRename={() => openRenamePopoverForNode(contextMenu!.nodeId)}
      onNewFolder={handleNewFolder}
      onClose={() => (contextMenu = null)}
    />
  {/if}

  {#if renamePopover}
    {@const popoverNode = getNodeById(renamePopover.nodeId)}
    {#if popoverNode}
      <TabRenamePopover
        node={popoverNode}
        anchorRect={renamePopover.anchorRect}
        onClose={() => (renamePopover = null)}
      />
    {/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  header h1 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.02em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .gear {
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font-size: 14px;
    cursor: pointer;
    border-radius: 4px;
    padding: 0;
    line-height: 1;
  }

  .gear:hover {
    background: color-mix(in srgb, var(--fg) 10%, transparent);
    color: var(--fg);
  }

  .gear:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .list {
    position: relative;
    padding: 4px 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .status {
    margin: 12px 12px;
    font-size: 12px;
    color: var(--fg-muted);
  }
</style>
