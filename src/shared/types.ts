export type NodeId = string

export type PanelId = string

export type GroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange'

export interface TreeNode {
  id: NodeId
  tabId: number
  windowId: number
  url: string
  title: string
  customTitle?: string
  favIconUrl?: string
  parentId: NodeId | null
  childIds: NodeId[]
  collapsed: boolean
  pinned: boolean
  groupId?: number
  audible?: boolean
  muted?: boolean
  panelId: PanelId
}

export interface Panel {
  id: PanelId
  name: string
  icon: string
  color: GroupColor
  windowId: number
}

export type CloseParentBehavior = 'promote' | 'subtree'

export type TabPlacement = 'child' | 'first-child' | 'sibling' | 'root-end' | 'root-top'

export type Density = 'comfortable' | 'compact'

export type PinnedScope = 'panel' | 'window'

export interface Settings {
  defaultCloseBehavior: CloseParentBehavior
  theme: 'system' | 'light' | 'dark'
  newTabFromLink: TabPlacement
  newTabBlank: TabPlacement
  density: Density
  pinnedScope: PinnedScope
}

export interface GroupInfo {
  groupId: number
  windowId: number
  title: string
  color: GroupColor
  collapsed: boolean
}

export interface StoredStateV1 {
  version: 1
  nodesByWindow: Record<number, Record<NodeId, TreeNode>>
  rootOrderByWindow: Record<number, NodeId[]>
  groupsByWindow: Record<number, Record<number, GroupInfo>>
  settings: Settings
}

export interface StoredState {
  version: 2
  nodesByWindow: Record<number, Record<NodeId, TreeNode>>
  rootOrderByWindow: Record<number, Record<PanelId, NodeId[]>>
  panelsByWindow: Record<number, Panel[]>
  panelOrderByWindow: Record<number, PanelId[]>
  activePanelByWindow: Record<number, PanelId>
  groupsByWindow: Record<number, Record<number, GroupInfo>>
  settings: Settings
}

export interface RenderEntry {
  nodeId: NodeId
  depth: number
}

export const DEFAULT_PANEL_ID: PanelId = 'default'

export const DEFAULT_SETTINGS: Settings = {
  defaultCloseBehavior: 'promote',
  theme: 'system',
  newTabFromLink: 'child',
  newTabBlank: 'root-end',
  density: 'comfortable',
  pinnedScope: 'panel',
}

export function createEmptyState(): StoredState {
  return {
    version: 2,
    nodesByWindow: {},
    rootOrderByWindow: {},
    panelsByWindow: {},
    panelOrderByWindow: {},
    activePanelByWindow: {},
    groupsByWindow: {},
    settings: { ...DEFAULT_SETTINGS },
  }
}
