import type { NodeId, PanelId, TreeNode } from './types'

export function buildNodeFromTab(
  tab: chrome.tabs.Tab,
  nodeId: NodeId,
  panelId: PanelId,
  overrides?: { collapsed?: boolean; customTitle?: string },
): TreeNode {
  const node: TreeNode = {
    id: nodeId,
    tabId: tab.id!,
    windowId: tab.windowId!,
    url: tab.url ?? tab.pendingUrl ?? '',
    title: tab.title ?? '',
    parentId: null,
    childIds: [],
    collapsed: overrides?.collapsed ?? false,
    pinned: tab.pinned ?? false,
    panelId,
  }
  if (overrides?.customTitle !== undefined) node.customTitle = overrides.customTitle
  if (tab.favIconUrl !== undefined) node.favIconUrl = tab.favIconUrl
  if (tab.groupId !== undefined && tab.groupId !== -1) node.groupId = tab.groupId
  if (tab.audible !== undefined) node.audible = tab.audible
  if (tab.mutedInfo?.muted !== undefined) node.muted = tab.mutedInfo.muted
  return node
}
