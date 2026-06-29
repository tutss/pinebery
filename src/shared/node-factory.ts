import type { NodeId, PanelId, TreeNode } from './types'

export function buildNodeFromTab(
  tab: chrome.tabs.Tab,
  nodeId: NodeId,
  panelId: PanelId,
  overrides?: { collapsed?: boolean; customTitle?: string },
): TreeNode {
  const node: TreeNode = {
    id: nodeId,
    kind: 'tab',
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
  if (tab.favIconUrl) node.favIconUrl = tab.favIconUrl
  if (tab.groupId !== undefined && tab.groupId !== -1) node.groupId = tab.groupId
  if (tab.audible !== undefined) node.audible = tab.audible
  if (tab.mutedInfo?.muted !== undefined) node.muted = tab.mutedInfo.muted
  return node
}

/**
 * Builds a folder node — a virtual container with no backing Chrome tab. It
 * lives in the same tree as tab nodes and can hold tabs or other folders.
 */
export function buildFolderNode(
  nodeId: NodeId,
  windowId: number,
  panelId: PanelId,
  title: string,
): TreeNode {
  return {
    id: nodeId,
    kind: 'folder',
    windowId,
    title,
    parentId: null,
    childIds: [],
    collapsed: false,
    pinned: false,
    panelId,
  }
}
