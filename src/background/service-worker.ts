import { getState, initializeState, setState, withStateLock } from './state'
import { loadStoredState, rehydrate, saveBackupAndPrune, saveStoredState } from './persistence'
import { registerChromeListeners } from './chrome-listeners'
import {
  getNode,
  closeNode,
  moveNode,
  toggleCollapse,
  createPanel,
  deletePanel,
  moveToPanel,
  reorderPanels,
  replaceTabId,
} from './tree-ops'
import { markOwnMove } from './move-tracking'
import type { GroupColor, Panel, TreeNode } from '../shared/types'
import { DEFAULT_PANEL_ID } from '../shared/types'
import {
  MSG_ACTIVATE_TAB,
  MSG_CLOSE_NODE,
  MSG_CREATE_PANEL,
  MSG_CREATE_PANEL_RESPONSE,
  MSG_DELETE_PANEL,
  MSG_MOVE_NODE,
  MSG_MOVE_TO_PANEL,
  MSG_REORDER_PANELS,
  MSG_REQUEST_TREE,
  MSG_SET_ACTIVE_PANEL,
  MSG_TOGGLE_COLLAPSE,
  MSG_TOGGLE_PIN,
  MSG_TREE_UPDATED,
  MSG_UPDATE_PANEL,
  MSG_UPDATE_SETTINGS,
  type PineberyMessage,
  type CloseNodeMessage,
  type MoveNodeMessage,
  type ToggleCollapseMessage,
  type UpdateSettingsMessage,
  type UpdatePanelMessage,
  type DeletePanelMessage,
  type ReorderPanelsMessage,
  type MoveToPanelMessage,
} from '../shared/messages'
import type { StoredState } from '../shared/types'
import { log, warn } from '../shared/logger'

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => {
      console.error('pinebery: failed to set side panel behavior', error)
    })
} else {
  console.warn(
    'pinebery: chrome.sidePanel API is not available. ' +
      'Check that the manifest includes the "sidePanel" permission and that Chrome is 114+.',
  )
}

const PANEL_COLOR_CYCLE: GroupColor[] = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'pink', 'yellow', 'grey']

async function tryRecoverTabId(node: TreeNode): Promise<number | null> {
  if (!node.url) return null
  let candidates: chrome.tabs.Tab[]
  try {
    candidates = await chrome.tabs.query({ url: node.url, windowId: node.windowId })
  } catch {
    return null
  }
  if (candidates.length !== 1) return null
  const found = candidates[0]
  if (!found?.id) return null
  const newTabId = found.id
  await withStateLock(async () => {
    const current = await getState()
    const result = replaceTabId(current, node.tabId, newTabId)
    if (result.updated) {
      log('activate-tab recovered tabId', {
        nodeId: node.id,
        oldTabId: node.tabId,
        newTabId,
      })
      await setState(result.state)
    }
  })
  return newTabId
}

function countNodeStats(state: StoredState): { total: number; withParent: number } {
  let total = 0
  let withParent = 0
  for (const bucket of Object.values(state.nodesByWindow)) {
    for (const node of Object.values(bucket)) {
      total++
      if (node.parentId !== null) withParent++
    }
  }
  return { total, withParent }
}

async function bootstrap(): Promise<StoredState> {
  const allTabs = await chrome.tabs.query({})
  const prior = await loadStoredState()

  const priorStats = prior ? countNodeStats(prior) : null
  if (priorStats) {
    log('bootstrap prior state loaded', {
      priorNodes: priorStats.total,
      priorWithParent: priorStats.withParent,
      currentTabs: allTabs.length,
    })
  } else {
    warn('bootstrap prior state is NULL — tree will be flat')
  }

  const { state } = rehydrate(allTabs, prior)

  const rehydratedStats = countNodeStats(state)
  log('bootstrap rehydrate result', {
    rehydratedNodes: rehydratedStats.total,
    rehydratedWithParent: rehydratedStats.withParent,
  })

  if (prior && priorStats) {
    const degradationRatio =
      priorStats.withParent > 0
        ? (priorStats.withParent - rehydratedStats.withParent) / priorStats.withParent
        : 0
    log('bootstrap rehydrate degradation', {
      priorWithParent: priorStats.withParent,
      rehydratedWithParent: rehydratedStats.withParent,
      degradationRatio,
    })

    if (priorStats.withParent >= 5 && degradationRatio >= 0.5) {
      const currentTabSample = allTabs.slice(0, 10).map((t) => ({
        id: t.id,
        url: t.url,
        openerTabId: t.openerTabId,
      }))
      const priorTabSample: { tabId: number; url: string; parentId: string | null }[] = []
      for (const bucket of Object.values(prior.nodesByWindow)) {
        for (const node of Object.values(bucket)) {
          if (priorTabSample.length >= 10) break
          priorTabSample.push({ tabId: node.tabId, url: node.url, parentId: node.parentId })
        }
        if (priorTabSample.length >= 10) break
      }
      try {
        const backupKey = await saveBackupAndPrune(prior)
        warn('rehydrate degraded heavily — saved backup', {
          backupKey,
          priorWithParent: priorStats.withParent,
          rehydratedWithParent: rehydratedStats.withParent,
          degradationRatio,
          currentTabsCount: allTabs.length,
          priorTabsCount: priorStats.total,
          currentTabSample,
          priorTabSample,
        })
      } catch (error) {
        console.error('pinebery: failed to save degradation backup', error)
      }
    }
  }

  const allGroups = await chrome.tabGroups.query({})
  state.groupsByWindow = {}
  for (const group of allGroups) {
    const bucket = state.groupsByWindow[group.windowId] ?? {}
    bucket[group.id] = {
      groupId: group.id,
      windowId: group.windowId,
      title: group.title ?? '',
      color: group.color as GroupColor,
      collapsed: group.collapsed,
    }
    state.groupsByWindow[group.windowId] = bucket
  }

  for (const windowIdKey of Object.keys(state.nodesByWindow)) {
    const windowId = Number(windowIdKey)
    if (!state.panelsByWindow[windowId] || state.panelsByWindow[windowId].length === 0) {
      const defaultPanel: Panel = {
        id: DEFAULT_PANEL_ID,
        name: 'Tabs',
        icon: '📄',
        color: 'grey',
        windowId,
      }
      state.panelsByWindow[windowId] = [defaultPanel]
      state.panelOrderByWindow[windowId] = [DEFAULT_PANEL_ID]
      if (!state.rootOrderByWindow[windowId]) {
        state.rootOrderByWindow[windowId] = {}
      }
      if (!state.rootOrderByWindow[windowId][DEFAULT_PANEL_ID]) {
        state.rootOrderByWindow[windowId][DEFAULT_PANEL_ID] = []
      }
    }
  }

  await saveStoredState(state)
  log(
    'bootstrap complete',
    `windows=${Object.keys(state.nodesByWindow).length}`,
    `tabs=${allTabs.length}`,
    `groups=${allGroups.length}`,
  )
  return state
}

void initializeState(bootstrap).catch((error: unknown) => {
  console.error('pinebery: bootstrap failed', error)
})
registerChromeListeners()

interface MutationResult {
  state: StoredState
  postOp?: () => Promise<void>
}

type MutationHandler = (currentState: StoredState, msg: PineberyMessage) => MutationResult

function handleCloseNode(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { nodeId, mode } = msg as CloseNodeMessage
  const result = closeNode(currentState, nodeId, mode)
  if (result.removedTabIds.length > 0) {
    return { state: result.state, postOp: () => chrome.tabs.remove(result.removedTabIds) }
  }
  return { state: result.state }
}

function handleMoveNode(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { nodeId, newParentId, newIndex, targetPanelId } = msg as MoveNodeMessage
  const nextState = moveNode(currentState, nodeId, newParentId, newIndex, targetPanelId)
  return {
    state: nextState,
    postOp: () => syncChromeTabOrder(nextState, nodeId),
  }
}

function handleToggleCollapse(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { nodeId } = msg as ToggleCollapseMessage
  return { state: toggleCollapse(currentState, nodeId) }
}

function handleUpdateSettings(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { patch } = msg as UpdateSettingsMessage
  const nextState = structuredClone(currentState)
  nextState.settings = { ...nextState.settings, ...patch }
  return { state: nextState }
}

function buildNewPanel(currentState: StoredState, windowId: number): Panel {
  const existingPanels = currentState.panelsByWindow[windowId] ?? []
  const colorIndex = existingPanels.length % PANEL_COLOR_CYCLE.length
  return {
    id: crypto.randomUUID(),
    name: `Panel ${existingPanels.length + 1}`,
    icon: '📁',
    color: PANEL_COLOR_CYCLE[colorIndex]!,
    windowId,
  }
}

function handleUpdatePanel(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { windowId, panelId, patch } = msg as UpdatePanelMessage
  const nextState = structuredClone(currentState)
  const panels = nextState.panelsByWindow[windowId]
  if (panels) {
    const panel = panels.find((p) => p.id === panelId)
    if (panel) {
      if (patch.name !== undefined) panel.name = patch.name
      if (patch.icon !== undefined) panel.icon = patch.icon
      if (patch.color !== undefined) panel.color = patch.color
    }
  }
  return { state: nextState }
}

function handleDeletePanel(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { windowId, panelId } = msg as DeletePanelMessage
  const result = deletePanel(currentState, windowId, panelId)
  if (result.removedTabIds.length > 0) {
    return { state: result.state, postOp: () => chrome.tabs.remove(result.removedTabIds) }
  }
  return { state: result.state }
}

function handleReorderPanels(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { windowId, orderedPanelIds } = msg as ReorderPanelsMessage
  return { state: reorderPanels(currentState, windowId, orderedPanelIds) }
}

function handleMoveToPanel(currentState: StoredState, msg: PineberyMessage): MutationResult {
  const { nodeId, targetPanelId, moveSubtree } = msg as MoveToPanelMessage
  return { state: moveToPanel(currentState, nodeId, targetPanelId, moveSubtree) }
}

const mutationHandlers: Record<string, MutationHandler> = {
  [MSG_CLOSE_NODE]: handleCloseNode,
  [MSG_MOVE_NODE]: handleMoveNode,
  [MSG_TOGGLE_COLLAPSE]: handleToggleCollapse,
  [MSG_UPDATE_SETTINGS]: handleUpdateSettings,
  [MSG_UPDATE_PANEL]: handleUpdatePanel,
  [MSG_DELETE_PANEL]: handleDeletePanel,
  [MSG_REORDER_PANELS]: handleReorderPanels,
  [MSG_MOVE_TO_PANEL]: handleMoveToPanel,
}

chrome.runtime.onMessage.addListener((message: PineberyMessage, _sender, sendResponse) => {
  if (message.type === MSG_REQUEST_TREE) {
    void getState()
      .then((currentState) => {
        sendResponse({ type: MSG_TREE_UPDATED, state: currentState })
      })
      .catch((error: unknown) => {
        warn('request-tree failed', error)
      })
    return true
  }

  if (message.type === MSG_ACTIVATE_TAB) {
    void getState()
      .then(async (currentState) => {
        const node = getNode(currentState, message.nodeId)
        if (!node) return
        try {
          await chrome.tabs.update(node.tabId, { active: true })
          await chrome.windows.update(node.windowId, { focused: true })
        } catch (error) {
          const recoveredTabId = await tryRecoverTabId(node)
          if (recoveredTabId !== null) {
            try {
              await chrome.tabs.update(recoveredTabId, { active: true })
              await chrome.windows.update(node.windowId, { focused: true })
            } catch (retryError) {
              warn('failed to activate tab after recovery', retryError)
            }
          } else {
            warn('failed to activate tab', error)
          }
        }
      })
      .catch((error: unknown) => {
        warn('activate-tab failed', error)
      })
    return false
  }

  if (message.type === MSG_SET_ACTIVE_PANEL) {
    void withStateLock(async () => {
      const current = await getState()
      if (current.activePanelByWindow[message.windowId] === message.panelId) return
      const next = structuredClone(current)
      next.activePanelByWindow[message.windowId] = message.panelId
      await setState(next)
    })
    return false
  }

  if (message.type === MSG_TOGGLE_PIN) {
    void getState()
      .then(async (currentState) => {
        const node = getNode(currentState, message.nodeId)
        if (!node) return
        try {
          await chrome.tabs.update(node.tabId, { pinned: !node.pinned })
        } catch (error) {
          warn('toggle-pin failed', error)
        }
      })
      .catch((error: unknown) => {
        warn('toggle-pin failed', error)
      })
    return false
  }

  if (message.type === MSG_CREATE_PANEL) {
    void withStateLock(async () => {
      const currentState = await getState()
      try {
        const panel = buildNewPanel(currentState, message.windowId)
        const nextState = createPanel(currentState, message.windowId, panel)
        await setState(nextState)
        sendResponse({ type: MSG_CREATE_PANEL_RESPONSE, panelId: panel.id })
      } catch (error) {
        warn(`${message.type} failed`, error)
        sendResponse(undefined)
      }
    })
    return true
  }

  const handler = mutationHandlers[message.type]
  if (handler) {
    void withStateLock(async () => {
      const currentState = await getState()
      try {
        const result = handler(currentState, message)
        await setState(result.state)
        if (result.postOp) await result.postOp()
      } catch (error) {
        warn(`${message.type} failed`, error)
      }
    })
    return false
  }

  return false
})

async function syncChromeTabOrder(state: StoredState, movedNodeId: string): Promise<void> {
  const movedNode = getNode(state, movedNodeId)
  if (!movedNode) return

  const windowTabs = await chrome.tabs.query({ windowId: movedNode.windowId })
  const pinnedCount = windowTabs.filter((tab) => tab.pinned).length

  const desiredOrder = computeDesiredTabOrder(state, movedNode.windowId)
  const targetIndex = desiredOrder.indexOf(movedNode.tabId)
  if (targetIndex === -1) return

  const chromeIndex = pinnedCount + targetIndex
  try {
    markOwnMove(movedNode.tabId)
    await chrome.tabs.move(movedNode.tabId, { index: chromeIndex })
  } catch (error) {
    warn('chrome.tabs.move failed', error)
  }
}

function computeDesiredTabOrder(state: StoredState, windowId: number): number[] {
  const result: number[] = []
  const bucket = state.nodesByWindow[windowId] ?? {}
  const panelOrder = state.panelOrderByWindow[windowId] ?? []
  for (const panelId of panelOrder) {
    const roots = state.rootOrderByWindow[windowId]?.[panelId] ?? []
    const stack = [...roots].reverse()
    while (stack.length > 0) {
      const nodeId = stack.pop()!
      const node = bucket[nodeId]
      if (!node || node.pinned) continue
      result.push(node.tabId)
      for (let i = node.childIds.length - 1; i >= 0; i--) {
        stack.push(node.childIds[i]!)
      }
    }
  }
  return result
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('pinebery: installed', details.reason)
})
