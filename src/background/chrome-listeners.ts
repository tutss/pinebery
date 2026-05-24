import type { GroupColor, PanelId, StoredState, TabPlacement, TreeNode } from '../shared/types'
import { getActivePanel, getState, setState, withStateLock } from './state'
import {
  getNode,
  findNodeByTabId,
  insertChild,
  insertRoot,
  closeNode,
  replaceTabId,
  promoteToRoot,
} from './tree-ops'
import { log, warn } from '../shared/logger'
import { buildNodeFromTab } from '../shared/node-factory'

export function registerChromeListeners(): void {
  chrome.tabs.onCreated.addListener((tab) => {
    void withStateLock(() => handleTabCreated(tab))
  })

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    log('tab-removed event', {
      tabId,
      windowId: removeInfo.windowId,
      isWindowClosing: removeInfo.isWindowClosing,
    })
    void withStateLock(() => handleTabRemoved(tabId))
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    void withStateLock(() => handleTabUpdated(tabId, changeInfo, tab))
  })

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    void withStateLock(() => handleTabReplaced(addedTabId, removedTabId))
  })

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    log('tab-attached event', {
      tabId,
      newWindowId: attachInfo.newWindowId,
      newPosition: attachInfo.newPosition,
    })
  })

  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    log('tab-detached event', {
      tabId,
      oldWindowId: detachInfo.oldWindowId,
      oldPosition: detachInfo.oldPosition,
    })
  })

  chrome.windows.onRemoved.addListener((windowId) => {
    log('window-removed event', { windowId })
    void withStateLock(() => handleWindowRemoved(windowId))
  })

  chrome.tabGroups.onCreated.addListener((group) => {
    void withStateLock(() => handleGroupChanged(group))
  })

  chrome.tabGroups.onUpdated.addListener((group) => {
    void withStateLock(() => handleGroupChanged(group))
  })

  chrome.tabGroups.onRemoved.addListener((group) => {
    void withStateLock(() => handleGroupRemoved(group.id, group.windowId))
  })
}

function applyPlacement(
  state: StoredState,
  placement: TabPlacement,
  windowId: number,
  panelId: PanelId,
  node: TreeNode,
  opener: TreeNode | null,
): StoredState {
  if (placement === 'child' && opener) {
    return insertChild(state, opener.id, node)
  }
  if (placement === 'first-child' && opener) {
    return insertChild(state, opener.id, node, 0)
  }
  if (placement === 'sibling' && opener) {
    if (opener.parentId !== null) {
      const parent = getNode(state, opener.parentId)
      if (parent) {
        const openerIndex = parent.childIds.indexOf(opener.id)
        return insertChild(state, parent.id, node, openerIndex + 1)
      }
    }
    return insertRoot(state, windowId, panelId, node, opener.id)
  }
  if (placement === 'root-top') {
    return insertRoot(state, windowId, panelId, node, undefined, 0)
  }
  return insertRoot(state, windowId, panelId, node)
}

async function ensureTabInTree(
  state: StoredState,
  tab: chrome.tabs.Tab,
): Promise<StoredState | null> {
  if (tab.id === undefined || tab.windowId === undefined) return null
  if (findNodeByTabId(state, tab.id)) return null

  warn('self-heal: tab not in tree, adding it', { tabId: tab.id, windowId: tab.windowId })
  const panelId = getActivePanel(tab.windowId)
  const nodeId = crypto.randomUUID()
  const node = buildNodeFromTab(tab, nodeId, panelId)
  return insertRoot(state, tab.windowId, panelId, node)
}

async function handleTabCreated(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) return
  const state = await getState()
  if (findNodeByTabId(state, tab.id)) return

  const openerNodeId =
    tab.openerTabId !== undefined ? (findNodeByTabId(state, tab.openerTabId)?.id ?? null) : null
  const opener = openerNodeId ? state.nodesByWindow[tab.windowId]?.[openerNodeId] : null
  const hasOpener = opener !== null && opener !== undefined && opener.windowId === tab.windowId

  const tabUrl = (tab.pendingUrl ?? tab.url ?? '').toLowerCase()
  const isWebLink = tabUrl.startsWith('http://') || tabUrl.startsWith('https://')
  const isLinkOpened = hasOpener && isWebLink

  log('tab-created signals', {
    tabId: tab.id,
    openerTabId: tab.openerTabId,
    hasOpener,
    pendingUrl: tab.pendingUrl,
    url: tab.url,
    active: tab.active,
    isWebLink,
    isLinkOpened,
  })

  const panelId = isLinkOpened && opener ? opener.panelId : getActivePanel(tab.windowId)

  const nodeId = crypto.randomUUID()
  const node = buildNodeFromTab(tab, nodeId, panelId)

  const placement = isLinkOpened ? state.settings.newTabFromLink : state.settings.newTabBlank
  const requiresOpener = placement === 'child' || placement === 'first-child' || placement === 'sibling'
  const effectivePlacement = requiresOpener && !hasOpener ? 'root-end' : placement

  log('tab-created placement', {
    tabId: tab.id,
    isLinkOpened,
    placement,
    effectivePlacement,
  })

  const nextState = applyPlacement(state, effectivePlacement, tab.windowId, panelId, node, hasOpener ? opener! : null)
  await setState(nextState)

  const placedNode = nextState.nodesByWindow[tab.windowId]?.[nodeId]
  log('tab-created placed', {
    tabId: tab.id,
    nodeId,
    windowId: tab.windowId,
    panelId,
    parentId: placedNode?.parentId ?? null,
  })
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const state = await getState()
  const node = findNodeByTabId(state, tabId)
  if (!node) {
    log('tab-removed no matching node', { tabId })
    return
  }
  log('tab-removed closing node', {
    tabId,
    nodeId: node.id,
    windowId: node.windowId,
    panelId: node.panelId,
    parentId: node.parentId,
    childCount: node.childIds.length,
  })
  const result = closeNode(state, node.id, 'promote')
  await setState(result.state)
}

async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.OnUpdatedInfo,
  tab: chrome.tabs.Tab,
): Promise<void> {
  log('tab-updated event', {
    tabId,
    windowId: tab.windowId,
    changeKeys: Object.keys(changeInfo),
    groupId: changeInfo.groupId,
    pinned: changeInfo.pinned,
    status: changeInfo.status,
  })
  const state = await getState()
  const existing = findNodeByTabId(state, tabId)
  if (!existing) {
    const healed = await ensureTabInTree(state, tab)
    if (healed) await setState(healed)
    return
  }

  const next = structuredClone(state)
  const target = next.nodesByWindow[existing.windowId]?.[existing.id]
  if (!target) return

  if (changeInfo.url !== undefined) target.url = changeInfo.url
  else if (tab.url !== undefined) target.url = tab.url

  if (changeInfo.title !== undefined) target.title = changeInfo.title
  else if (tab.title !== undefined) target.title = tab.title

  if (changeInfo.favIconUrl !== undefined) {
    if (changeInfo.favIconUrl) {
      target.favIconUrl = changeInfo.favIconUrl
    } else {
      delete target.favIconUrl
    }
  } else if (tab.favIconUrl) {
    target.favIconUrl = tab.favIconUrl
  }

  if (changeInfo.pinned !== undefined) target.pinned = changeInfo.pinned
  if (changeInfo.audible !== undefined) target.audible = changeInfo.audible
  if (changeInfo.mutedInfo !== undefined) target.muted = changeInfo.mutedInfo.muted

  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId === -1) delete target.groupId
    else target.groupId = changeInfo.groupId
  }

  if (changeInfo.pinned === true && target.parentId !== null) {
    const promoted = promoteToRoot(next, existing.id)
    await setState(promoted)
    return
  }

  await setState(next)
}

async function handleTabReplaced(addedTabId: number, removedTabId: number): Promise<void> {
  const state = await getState()
  const result = replaceTabId(state, removedTabId, addedTabId)
  if (!result.updated) {
    log('tab-replaced ignored (no matching node)', { addedTabId, removedTabId })
    return
  }
  log('tab-replaced', { addedTabId, removedTabId })
  await setState(result.state)
}

async function handleWindowRemoved(windowId: number): Promise<void> {
  const state = await getState()
  if (
    !state.nodesByWindow[windowId] &&
    !state.rootOrderByWindow[windowId] &&
    !state.groupsByWindow[windowId] &&
    !state.panelsByWindow[windowId] &&
    state.activePanelByWindow[windowId] === undefined
  ) {
    return
  }
  const next = structuredClone(state)
  delete next.nodesByWindow[windowId]
  delete next.rootOrderByWindow[windowId]
  delete next.groupsByWindow[windowId]
  delete next.panelsByWindow[windowId]
  delete next.panelOrderByWindow[windowId]
  delete next.activePanelByWindow[windowId]
  await setState(next)
}

async function handleGroupChanged(group: chrome.tabGroups.TabGroup): Promise<void> {
  const state = await getState()
  const next = structuredClone(state)
  const bucket = next.groupsByWindow[group.windowId] ?? {}
  bucket[group.id] = {
    groupId: group.id,
    windowId: group.windowId,
    title: group.title ?? '',
    color: group.color as GroupColor,
    collapsed: group.collapsed,
  }
  next.groupsByWindow[group.windowId] = bucket
  await setState(next)
}

async function handleGroupRemoved(groupId: number, windowId: number): Promise<void> {
  const state = await getState()
  if (!state.groupsByWindow[windowId]?.[groupId]) return
  const next = structuredClone(state)
  const bucket = next.groupsByWindow[windowId]
  if (bucket) {
    delete bucket[groupId]
  }
  await setState(next)
}
