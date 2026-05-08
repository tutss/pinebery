import type {
  CloseParentBehavior,
  NodeId,
  PanelId,
  Settings,
  StoredState,
  RenderEntry,
  TreeNode,
  Panel,
  GroupColor,
} from '../../shared/types'
import { DEFAULT_PANEL_ID } from '../../shared/types'
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
} from '../../shared/messages'
import { flattenForRender } from '../../background/tree-ops'

function sendMsg(message: PineberyMessage): void {
  chrome.runtime.sendMessage(message).catch((error) => {
    console.warn(`pinebery: failed to send ${message.type}`, error)
  })
}

interface TreeStore {
  state: StoredState | null
  currentWindowId: number | null
  activePanelId: PanelId
  activeTabId: number | null
  isReady: boolean
}

export const treeStore = $state<TreeStore>({
  state: null,
  currentWindowId: null,
  activePanelId: DEFAULT_PANEL_ID,
  activeTabId: null,
  isReady: false,
})

export const dragState = $state<{ nodeId: NodeId | null }>({ nodeId: null })

export function getPanelById(panelId: PanelId | null): Panel | null {
  if (!panelId || !treeStore.state || treeStore.currentWindowId === null) return null
  const panels = treeStore.state.panelsByWindow[treeStore.currentWindowId] ?? []
  return panels.find((p) => p.id === panelId) ?? null
}

export async function initializeTreeStore(): Promise<void> {
  const currentWindow = await chrome.windows.getCurrent()
  treeStore.currentWindowId = currentWindow.id ?? null

  if (treeStore.currentWindowId !== null) {
    try {
      const activeTabs = await chrome.tabs.query({
        active: true,
        windowId: treeStore.currentWindowId,
      })
      treeStore.activeTabId = activeTabs[0]?.id ?? null
    } catch (error) {
      console.warn('pinebery: failed to query initial active tab', error)
    }
  }

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    if (windowId === treeStore.currentWindowId) {
      treeStore.activeTabId = tabId
    }
  })

  try {
    const response = (await chrome.runtime.sendMessage({
      type: MSG_REQUEST_TREE,
    })) as PineberyMessage | undefined
    if (response && response.type === MSG_TREE_UPDATED) {
      treeStore.state = response.state
      const windowId = treeStore.currentWindowId
      if (windowId !== null) {
        const stored = response.state.activePanelByWindow[windowId]
        const panels = response.state.panelsByWindow[windowId] ?? []
        const isStoredValid = stored && panels.some((p) => p.id === stored)
        if (isStoredValid) {
          treeStore.activePanelId = stored
        } else {
          const panelOrder = response.state.panelOrderByWindow[windowId]
          if (panelOrder && panelOrder.length > 0) {
            treeStore.activePanelId = panelOrder[0]!
          }
        }
      }
    }
  } catch (error) {
    console.warn('pinebery: failed to request initial tree', error)
  }

  chrome.runtime.onMessage.addListener((message: PineberyMessage) => {
    if (message.type === MSG_TREE_UPDATED) {
      treeStore.state = message.state
    }
    return false
  })

  treeStore.isReady = true
}

export function getRenderedEntries(): RenderEntry[] {
  if (!treeStore.state || treeStore.currentWindowId === null) return []
  return flattenForRender(treeStore.state, treeStore.currentWindowId, treeStore.activePanelId)
}

export function getNodeById(nodeId: NodeId): TreeNode | null {
  if (!treeStore.state || treeStore.currentWindowId === null) return null
  return treeStore.state.nodesByWindow[treeStore.currentWindowId]?.[nodeId] ?? null
}

export function activateTab(nodeId: NodeId): void {
  sendMsg({ type: MSG_ACTIVATE_TAB, nodeId })
}

export function closeNodeRequest(nodeId: NodeId, mode: CloseParentBehavior): void {
  sendMsg({ type: MSG_CLOSE_NODE, nodeId, mode })
}

export function moveNodeRequest(
  nodeId: NodeId,
  newParentId: NodeId | null,
  newIndex: number,
): void {
  sendMsg({ type: MSG_MOVE_NODE, nodeId, newParentId, newIndex })
}

export function toggleCollapseRequest(nodeId: NodeId): void {
  sendMsg({ type: MSG_TOGGLE_COLLAPSE, nodeId })
}

export function togglePinRequest(nodeId: NodeId): void {
  sendMsg({ type: MSG_TOGGLE_PIN, nodeId })
}

export function updateSettingsRequest(patch: Partial<Settings>): void {
  sendMsg({ type: MSG_UPDATE_SETTINGS, patch })
}

export function setActivePanel(panelId: PanelId): void {
  treeStore.activePanelId = panelId
  if (treeStore.currentWindowId !== null) {
    sendMsg({ type: MSG_SET_ACTIVE_PANEL, windowId: treeStore.currentWindowId, panelId })
  }
}

export async function createPanelRequest(): Promise<PanelId | null> {
  if (treeStore.currentWindowId === null) return null
  try {
    const response = (await chrome.runtime.sendMessage({
      type: MSG_CREATE_PANEL,
      windowId: treeStore.currentWindowId,
    })) as PineberyMessage | undefined
    if (response && response.type === MSG_CREATE_PANEL_RESPONSE) {
      return response.panelId
    }
  } catch (error) {
    console.warn('pinebery: failed to send pinebery/create-panel', error)
  }
  return null
}

export function updatePanelRequest(
  panelId: PanelId,
  patch: { name?: string; icon?: string; color?: GroupColor },
): void {
  if (treeStore.currentWindowId === null) return
  sendMsg({ type: MSG_UPDATE_PANEL, panelId, windowId: treeStore.currentWindowId, patch })
}

export function deletePanelRequest(panelId: PanelId): void {
  if (treeStore.currentWindowId === null) return
  sendMsg({ type: MSG_DELETE_PANEL, panelId, windowId: treeStore.currentWindowId })
}

export function reorderPanelsRequest(orderedPanelIds: PanelId[]): void {
  if (treeStore.currentWindowId === null) return
  sendMsg({ type: MSG_REORDER_PANELS, windowId: treeStore.currentWindowId, orderedPanelIds })
}

export function moveToPanelRequest(
  nodeId: NodeId,
  targetPanelId: PanelId,
  moveSubtree: boolean,
): void {
  sendMsg({ type: MSG_MOVE_TO_PANEL, nodeId, targetPanelId, moveSubtree })
}

export function getPanelsForCurrentWindow(): Panel[] {
  if (!treeStore.state || treeStore.currentWindowId === null) return []
  const windowId = treeStore.currentWindowId
  const order = treeStore.state.panelOrderByWindow[windowId] ?? []
  const panels = treeStore.state.panelsByWindow[windowId] ?? []
  const panelMap = new Map(panels.map((p) => [p.id, p]))
  return order.map((id) => panelMap.get(id)).filter((p): p is Panel => p !== undefined)
}
