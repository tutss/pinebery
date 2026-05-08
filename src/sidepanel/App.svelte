<script lang="ts">
  import { onMount } from 'svelte'
  import TabRow from './components/TabRow.svelte'
  import Filter from './components/Filter.svelte'
  import PinnedSection from './components/PinnedSection.svelte'
  import PanelStrip from './components/PanelStrip.svelte'
  import TabContextMenu from './components/TabContextMenu.svelte'
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
  } from './stores/tree.svelte'
  import { filterRenderEntries, type FilteredEntry } from './filter'
  import { computeDropTarget, type RowLayout } from './dnd/indent-dnd'
  import { resolveGroupColor } from './group-colors'
  import { DEFAULT_SETTINGS, type RenderEntry, type TreeNode } from '../shared/types'

  const LIST_LEFT_OFFSET = 8

  let filterQuery = $state('')
  let listEl: HTMLDivElement | null = $state(null)

  let dropIndicator = $state({
    visible: false,
    topPx: 0,
    depth: 0,
  })

  let contextMenu = $state<{
    nodeId: string
    nodePanelId: string
    nodePinned: boolean
    x: number
    y: number
  } | null>(null)

  function handleTabContextMenu(
    event: MouseEvent,
    nodeId: string,
    nodePanelId: string,
    nodePinned: boolean,
  ) {
    event.preventDefault()
    contextMenu = { nodeId, nodePanelId, nodePinned, x: event.clientX, y: event.clientY }
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

  function collectRowLayouts(): RowLayout[] {
    if (!listEl) return []
    const listRect = listEl.getBoundingClientRect()
    const rows: RowLayout[] = []
    const children = listEl.querySelectorAll<HTMLElement>('[data-node-id]')
    children.forEach((child) => {
      const rect = child.getBoundingClientRect()
      const nodeId = child.dataset['nodeId']
      const depthStr = child.dataset['depth']
      if (!nodeId) return
      rows.push({
        nodeId,
        topPx: rect.top - listRect.top,
        bottomPx: rect.bottom - listRect.top,
        depth: Number(depthStr ?? '0'),
      })
    })
    return rows
  }

  function handleRowDragStart(_event: DragEvent, nodeId: string) {
    dragState.nodeId = nodeId
  }

  function handleRowDragEnd() {
    dragState.nodeId = null
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
    const cursorY = event.clientY - listRect.top
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
    })

    if (target) {
      dropIndicator = {
        visible: true,
        topPx: target.indicatorY,
        depth: target.indicatorDepth,
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
    const cursorY = event.clientY - listRect.top
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
    })

    if (target) {
      moveNodeRequest(dragState.nodeId, target.newParentId, target.newIndex)
    }

    dropIndicator.visible = false
    dragState.nodeId = null
  }
</script>

<main>
  <header>
    <h1>Pinebery</h1>
    <button
      type="button"
      class="gear"
      onclick={() => chrome.runtime.openOptionsPage()}
      aria-label="settings"
    >
      ⚙
    </button>
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
              oncontextmenu={(e) => handleTabContextMenu(e, entry.nodeId, node.panelId, node.pinned)}
            >
              <TabRow
                {node}
                depth={entry.depth}
                {matches}
                groupColor={groupColorForNode(node)}
                isActive={node.tabId === treeStore.activeTabId}
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
      panels={getPanelsForCurrentWindow()}
      x={contextMenu.x}
      y={contextMenu.y}
      onClose={() => (contextMenu = null)}
    />
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 6px 12px;
    border-bottom: 1px solid var(--border);
  }

  header h1 {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.02em;
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
  }

  .status {
    margin: 12px 12px;
    font-size: 12px;
    color: var(--fg-muted);
  }
</style>
