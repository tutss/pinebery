import type { NodeId, PanelId, StoredState, StoredStateV1, TreeNode, Panel } from '../shared/types'
import { createEmptyState, DEFAULT_PANEL_ID, DEFAULT_SETTINGS } from '../shared/types'
import { log, warn } from '../shared/logger'
import { buildNodeFromTab } from '../shared/node-factory'
import { enforcePinnedLeaves } from './tree-ops'

const STORAGE_KEY = 'pinebery-state-v1'
const BACKUP_KEY_PREFIX = 'pinebery-state-v1-backup-'
const MAX_BACKUPS = 3

function migrateV1toV2(v1: StoredStateV1): StoredState {
  const v2: StoredState = {
    version: 2,
    nodesByWindow: v1.nodesByWindow,
    rootOrderByWindow: {},
    panelsByWindow: {},
    panelOrderByWindow: {},
    activePanelByWindow: {},
    groupsByWindow: v1.groupsByWindow,
    settings: { ...DEFAULT_SETTINGS, ...v1.settings },
  }
  for (const windowIdKey of Object.keys(v1.rootOrderByWindow)) {
    const windowId = Number(windowIdKey)
    const oldOrder = v1.rootOrderByWindow[windowId] ?? []
    v2.rootOrderByWindow[windowId] = { [DEFAULT_PANEL_ID]: oldOrder }
    const defaultPanel: Panel = {
      id: DEFAULT_PANEL_ID,
      name: 'Tabs',
      icon: '📄',
      color: 'grey',
      windowId,
    }
    v2.panelsByWindow[windowId] = [defaultPanel]
    v2.panelOrderByWindow[windowId] = [DEFAULT_PANEL_ID]
  }
  return v2
}

export async function loadStoredState(): Promise<StoredState | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  const raw = result[STORAGE_KEY]
  if (!raw || typeof raw !== 'object') {
    return null
  }
  if ((raw as { version?: number }).version === 1 || (raw as { version?: number }).version === undefined) {
    const migrated = migrateV1toV2(raw as StoredStateV1)
    await chrome.storage.local.set({ [STORAGE_KEY]: migrated })
    return migrated
  }
  return raw as StoredState
}

export async function saveStoredState(state: StoredState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
}

export async function saveBackupAndPrune(prior: StoredState): Promise<string> {
  const key = `${BACKUP_KEY_PREFIX}${Date.now()}`
  await chrome.storage.local.set({ [key]: prior })
  const all = await chrome.storage.local.get(null)
  const backupKeys = Object.keys(all)
    .filter((k) => k.startsWith(BACKUP_KEY_PREFIX))
    .sort()
  if (backupKeys.length > MAX_BACKUPS) {
    const toRemove = backupKeys.slice(0, backupKeys.length - MAX_BACKUPS)
    await chrome.storage.local.remove(toRemove)
  }
  return key
}

export interface RehydrateResult {
  state: StoredState
}

export function rehydrate(
  currentTabs: chrome.tabs.Tab[],
  priorState: StoredState | null,
  generateNodeId: () => NodeId = () => crypto.randomUUID(),
): RehydrateResult {
  const nextState = createEmptyState()
  if (priorState) {
    nextState.settings = { ...DEFAULT_SETTINGS, ...priorState.settings }
    nextState.groupsByWindow = structuredClone(priorState.groupsByWindow)
    nextState.panelsByWindow = structuredClone(priorState.panelsByWindow ?? {})
    nextState.panelOrderByWindow = structuredClone(priorState.panelOrderByWindow ?? {})
    const priorActive = priorState.activePanelByWindow ?? {}
    for (const [windowIdKey, panelId] of Object.entries(priorActive)) {
      const windowId = Number(windowIdKey)
      const panels = nextState.panelsByWindow[windowId] ?? []
      if (panels.some((p) => p.id === panelId)) {
        nextState.activePanelByWindow[windowId] = panelId
      }
    }
  }

  const priorNodesByTabId = new Map<number, TreeNode>()
  const allPriorNodes: TreeNode[] = []
  if (priorState) {
    for (const bucket of Object.values(priorState.nodesByWindow)) {
      for (const node of Object.values(bucket)) {
        if (node.tabId !== undefined) priorNodesByTabId.set(node.tabId, node)
        allPriorNodes.push(node)
      }
    }
  }

  const priorByCurrentTab = new Map<number, TreeNode>()
  const claimedPriorIds = new Set<NodeId>()
  const tabIdMatchedTabIds = new Set<number>()

  let tabIdMatched = 0
  for (const tab of currentTabs) {
    if (tab.id === undefined) continue
    const prior = priorNodesByTabId.get(tab.id)
    if (prior) {
      priorByCurrentTab.set(tab.id, prior)
      claimedPriorIds.add(prior.id)
      tabIdMatchedTabIds.add(tab.id)
      tabIdMatched++
    }
  }

  let urlMatched = 0
  if (priorState && tabIdMatched < currentTabs.length) {
    const priorByUrl = new Map<string, TreeNode[]>()
    for (const node of allPriorNodes) {
      if (claimedPriorIds.has(node.id)) continue
      if (!node.url) continue
      const list = priorByUrl.get(node.url) ?? []
      list.push(node)
      priorByUrl.set(node.url, list)
    }

    for (const tab of currentTabs) {
      if (tab.id === undefined || tab.windowId === undefined) continue
      if (priorByCurrentTab.has(tab.id)) continue
      const url = tab.url ?? ''
      if (!url) continue

      const candidates = priorByUrl.get(url)
      if (!candidates || candidates.length === 0) continue
      const remaining = candidates.filter((c) => !claimedPriorIds.has(c.id))
      if (remaining.length === 0) continue

      let chosen: TreeNode | null = null
      if (remaining.length === 1) {
        chosen = remaining[0]!
      } else {
        const tabTitle = tab.title ?? ''
        const byTitle = remaining.filter((c) => c.title === tabTitle)
        const pool = byTitle.length > 0 ? byTitle : remaining
        if (pool.length === 1) {
          chosen = pool[0]!
        } else {
          const byWindow = pool.filter((c) => c.windowId === tab.windowId)
          if (byWindow.length === 1) {
            chosen = byWindow[0]!
          }
        }
      }

      if (chosen) {
        priorByCurrentTab.set(tab.id, chosen)
        claimedPriorIds.add(chosen.id)
        urlMatched++
      }
    }
  }

  const totalMatched = tabIdMatched + urlMatched
  const newTabsCount = currentTabs.length - totalMatched
  const isSessionContinuation = priorState !== null && totalMatched > 0

  const nodeIdByTabId = new Map<number, NodeId>()
  for (const tab of currentTabs) {
    if (tab.id === undefined || tab.windowId === undefined) continue
    const prior = priorByCurrentTab.get(tab.id)
    const nodeId = prior ? prior.id : generateNodeId()
    nodeIdByTabId.set(tab.id, nodeId)
  }

  log('rehydrate tab matching', {
    currentTabs: currentTabs.length,
    matchedToPrior: tabIdMatched,
    urlMatched,
    newTabs: newTabsCount,
    isSessionContinuation,
  })

  for (const tab of currentTabs) {
    if (tab.id === undefined || tab.windowId === undefined) continue
    const nodeId = nodeIdByTabId.get(tab.id)!
    const prior = priorByCurrentTab.get(tab.id)

    const isTabIdMatch = tabIdMatchedTabIds.has(tab.id)
    const carriedCustomTitle =
      isTabIdMatch && prior?.customTitle !== undefined ? prior.customTitle : undefined
    const overrides: { collapsed: boolean; customTitle?: string } = {
      collapsed: prior?.collapsed ?? false,
    }
    if (carriedCustomTitle !== undefined) overrides.customTitle = carriedCustomTitle

    const node = buildNodeFromTab(
      tab,
      nodeId,
      prior?.panelId ?? DEFAULT_PANEL_ID,
      overrides,
    )

    const bucket = nextState.nodesByWindow[tab.windowId] ?? {}
    bucket[nodeId] = node
    nextState.nodesByWindow[tab.windowId] = bucket
  }

  // Window remap and folder injection both run before tab parent resolution:
  // a tab nested under a folder can only re-link if that folder is already
  // present (in the right window) as a parent candidate.
  const oldToNewWindow = new Map<number, number>()
  const currentWindowIds = new Set(
    currentTabs.filter((t) => t.windowId !== undefined).map((t) => t.windowId!),
  )
  if (priorState) {
    const votesByNew = new Map<number, Map<number, number>>()
    for (const tab of currentTabs) {
      if (tab.id === undefined || tab.windowId === undefined) continue
      const prior = priorByCurrentTab.get(tab.id)
      if (!prior || prior.windowId === tab.windowId) continue
      if (!votesByNew.has(tab.windowId)) votesByNew.set(tab.windowId, new Map())
      const windowVotes = votesByNew.get(tab.windowId)!
      windowVotes.set(prior.windowId, (windowVotes.get(prior.windowId) ?? 0) + 1)
    }

    const claimedOld = new Set<number>()
    for (const [newWindowId, windowVotes] of votesByNew) {
      if ((nextState.panelsByWindow[newWindowId]?.length ?? 0) > 0) continue
      let bestOld = -1
      let bestCount = 0
      for (const [oldWindowId, count] of windowVotes) {
        if (claimedOld.has(oldWindowId)) continue
        if (count > bestCount) {
          bestOld = oldWindowId
          bestCount = count
        }
      }
      if (bestOld === -1) continue
      claimedOld.add(bestOld)
      oldToNewWindow.set(bestOld, newWindowId)

      const oldPanels = nextState.panelsByWindow[bestOld]
      if (oldPanels && oldPanels.length > 0) {
        nextState.panelsByWindow[newWindowId] = oldPanels.map((p) => ({
          ...p,
          windowId: newWindowId,
        }))
        delete nextState.panelsByWindow[bestOld]
      }
      if (nextState.panelOrderByWindow[bestOld]) {
        nextState.panelOrderByWindow[newWindowId] = nextState.panelOrderByWindow[bestOld]!
        delete nextState.panelOrderByWindow[bestOld]
      }
      if (nextState.activePanelByWindow[bestOld] !== undefined) {
        nextState.activePanelByWindow[newWindowId] = nextState.activePanelByWindow[bestOld]!
        delete nextState.activePanelByWindow[bestOld]
      }
    }

    for (const windowIdKey of Object.keys(nextState.panelsByWindow)) {
      const windowId = Number(windowIdKey)
      if (!currentWindowIds.has(windowId) && !nextState.nodesByWindow[windowId]) {
        delete nextState.panelsByWindow[windowId]
        delete nextState.panelOrderByWindow[windowId]
        delete nextState.activePanelByWindow[windowId]
      }
    }

    log('rehydrate window remap', {
      remappedWindows: claimedOld.size,
    })

    // Folders have no backing tab, so they are never rebuilt from currentTabs.
    // Carry them forward (keeping stable ids) into the window their tabs landed
    // in, so empty folders persist and nested tabs can re-link to them. childIds
    // and parentId are rebuilt below; we only seed the node and claim its id.
    let foldersKept = 0
    for (const folder of allPriorNodes) {
      if (folder.kind !== 'folder') continue
      const targetWindow = oldToNewWindow.get(folder.windowId) ?? folder.windowId
      if (!nextState.nodesByWindow[targetWindow]) continue
      const injected: TreeNode = {
        ...structuredClone(folder),
        windowId: targetWindow,
        parentId: null,
        childIds: [],
      }
      nextState.nodesByWindow[targetWindow]![folder.id] = injected
      claimedPriorIds.add(folder.id)
      foldersKept++
    }
    // Resolve each folder's own parent now that all folders and tabs are placed
    // (a folder's parent may itself be another folder seeded in the loop above).
    for (const folder of allPriorNodes) {
      if (folder.kind !== 'folder') continue
      const targetWindow = oldToNewWindow.get(folder.windowId) ?? folder.windowId
      const injected = nextState.nodesByWindow[targetWindow]?.[folder.id]
      if (!injected) continue
      if (
        folder.parentId &&
        claimedPriorIds.has(folder.parentId) &&
        nextState.nodesByWindow[targetWindow]?.[folder.parentId]
      ) {
        injected.parentId = folder.parentId
      }
    }
    if (foldersKept > 0) log('rehydrate folders kept', { foldersKept })
  }

  let parentResolved = 0
  let parentLost = 0
  const lostReasons: string[] = []

  for (const tab of currentTabs) {
    if (tab.id === undefined || tab.windowId === undefined) continue
    const nodeId = nodeIdByTabId.get(tab.id)!
    const node = nextState.nodesByWindow[tab.windowId]?.[nodeId]
    if (!node) continue

    const prior = priorByCurrentTab.get(tab.id)
    let resolvedParentId: NodeId | null = null

    if (prior && prior.parentId) {
      if (claimedPriorIds.has(prior.parentId)) {
        if (nextState.nodesByWindow[tab.windowId]?.[prior.parentId]) {
          resolvedParentId = prior.parentId
        } else {
          lostReasons.push(`tabId=${tab.id}: parent nodeId=${prior.parentId} not in window ${tab.windowId}`)
        }
      } else {
        lostReasons.push(`tabId=${tab.id}: parent nodeId=${prior.parentId} unmatched (parent tab not in current set)`)
      }
    }

    if (resolvedParentId === null && tab.openerTabId !== undefined) {
      // A prior node with parentId === null is a deliberate root (blank new
      // tab, promoted, or moved to another panel). Chrome keeps openerTabId
      // for the tab's whole lifetime, so falling back to it here would
      // re-nest such a tab under its opener — and drag it into the opener's
      // panel — on every service worker restart. Only fall back when the
      // prior parent was genuinely lost or there is no prior tree at all.
      const priorSaysRoot = prior !== undefined && prior.parentId === null
      if (!priorSaysRoot && (prior || !isSessionContinuation)) {
        const openerNodeId = nodeIdByTabId.get(tab.openerTabId)
        if (openerNodeId && nextState.nodesByWindow[tab.windowId]?.[openerNodeId]) {
          resolvedParentId = openerNodeId
        }
      }
    }

    if (prior && prior.parentId) {
      if (resolvedParentId) {
        parentResolved++
      } else {
        parentLost++
      }
    }

    if (tab.pinned) {
      node.parentId = null
    } else {
      node.parentId = resolvedParentId
    }
  }

  log('rehydrate parent resolution', {
    parentResolved,
    parentLost,
  })
  if (lostReasons.length > 0) {
    warn('rehydrate lost parent links', lostReasons)
  }

  const priorChildOrder = new Map<NodeId, NodeId[]>()
  const priorRootOrderByPanel = new Map<PanelId, NodeId[]>()
  if (priorState) {
    for (const bucket of Object.values(priorState.nodesByWindow)) {
      for (const priorNode of Object.values(bucket)) {
        if (priorNode.parentId !== null) {
          const list = priorChildOrder.get(priorNode.parentId) ?? []
          list.push(priorNode.id)
          priorChildOrder.set(priorNode.parentId, list)
        }
      }
    }
    for (const priorPanelRoots of Object.values(priorState.rootOrderByWindow)) {
      for (const [panelId, roots] of Object.entries(priorPanelRoots)) {
        const existing = priorRootOrderByPanel.get(panelId) ?? []
        const seen = new Set(existing)
        for (const r of roots) {
          if (!seen.has(r)) {
            existing.push(r)
            seen.add(r)
          }
        }
        priorRootOrderByPanel.set(panelId, existing)
      }
    }
  }

  for (const windowIdKey of Object.keys(nextState.nodesByWindow)) {
    const windowId = Number(windowIdKey)
    const bucket = nextState.nodesByWindow[windowId]!

    const validPanelIds = new Set((nextState.panelsByWindow[windowId] ?? []).map((p) => p.id))
    const fallbackPanelId = nextState.panelOrderByWindow[windowId]?.[0] ?? DEFAULT_PANEL_ID

    const childrenByParent = new Map<NodeId | null, NodeId[]>()
    for (const node of Object.values(bucket)) {
      const list = childrenByParent.get(node.parentId) ?? []
      list.push(node.id)
      childrenByParent.set(node.parentId, list)
    }

    const rootChildren = childrenByParent.get(null) ?? []

    // Every node must live in the same panel as its root ancestor: rendering
    // walks the tree by childIds and ignores a descendant's own panelId, so a
    // drifted panelId is invisible on screen yet makes the tab impossible to
    // move between panels (moveToPanel short-circuits on the stale value). This
    // drift happens when a tab is re-parented to an opener in another panel
    // during rehydration. Propagate each root's panel down its whole subtree to
    // restore the invariant, reassigning any root whose panel no longer exists
    // to a valid one so its tabs stay visible.
    let reassignedRoots = 0
    for (const rootId of rootChildren) {
      const rootNode = bucket[rootId]!
      let rootPanel = rootNode.panelId
      if (!validPanelIds.has(rootPanel)) {
        rootPanel = fallbackPanelId
        reassignedRoots++
      }
      const subtreeStack: NodeId[] = [rootId]
      while (subtreeStack.length > 0) {
        const id = subtreeStack.pop()!
        const node = bucket[id]
        if (!node) continue
        node.panelId = rootPanel
        for (const childId of childrenByParent.get(id) ?? []) {
          subtreeStack.push(childId)
        }
      }
    }
    if (reassignedRoots > 0) {
      warn('rehydrate reassigned stranded roots to valid panel', {
        windowId,
        reassignedRoots,
        fallbackPanelId,
      })
    }

    const rootsByPanel = new Map<PanelId, NodeId[]>()
    for (const rootId of rootChildren) {
      const node = bucket[rootId]!
      const panelId = node.panelId
      const list = rootsByPanel.get(panelId) ?? []
      list.push(rootId)
      rootsByPanel.set(panelId, list)
    }

    if (!nextState.rootOrderByWindow[windowId]) {
      nextState.rootOrderByWindow[windowId] = {}
    }

    for (const [panelId, roots] of rootsByPanel) {
      const priorOrder = priorRootOrderByPanel.get(panelId) ?? []
      const rootSet = new Set(roots)
      const ordered: NodeId[] = []
      for (const id of priorOrder) {
        if (rootSet.has(id)) {
          ordered.push(id)
          rootSet.delete(id)
        }
      }
      for (const id of roots) {
        if (rootSet.has(id)) {
          ordered.push(id)
        }
      }
      nextState.rootOrderByWindow[windowId][panelId] = ordered
    }

    if (!nextState.rootOrderByWindow[windowId][DEFAULT_PANEL_ID]) {
      nextState.rootOrderByWindow[windowId][DEFAULT_PANEL_ID] = []
    }

    for (const [parentId, children] of childrenByParent) {
      if (parentId === null) continue
      const priorList = priorChildOrder.get(parentId) ?? []
      const childSet = new Set(children)
      const ordered: NodeId[] = []
      for (const id of priorList) {
        if (childSet.has(id)) {
          ordered.push(id)
          childSet.delete(id)
        }
      }
      for (const id of children) {
        if (childSet.has(id)) {
          ordered.push(id)
        }
      }
      const parentNode = bucket[parentId]
      if (parentNode) {
        parentNode.childIds = ordered
      }
    }

    if (!nextState.panelsByWindow[windowId] || nextState.panelsByWindow[windowId].length === 0) {
      const defaultPanel: Panel = {
        id: DEFAULT_PANEL_ID,
        name: 'Tabs',
        icon: '📄',
        color: 'grey',
        windowId,
      }
      nextState.panelsByWindow[windowId] = [defaultPanel]
      nextState.panelOrderByWindow[windowId] = [DEFAULT_PANEL_ID]
    }
  }

  return { state: enforcePinnedLeaves(nextState) }
}
