import type {
  NodeId,
  PanelId,
  GroupColor,
  Settings,
  StoredState,
  CloseParentBehavior,
} from './types'

export const MSG_TREE_UPDATED = 'pinebery/tree-updated' as const
export const MSG_REQUEST_TREE = 'pinebery/request-tree' as const
export const MSG_MOVE_NODE = 'pinebery/move-node' as const
export const MSG_CLOSE_NODE = 'pinebery/close-node' as const
export const MSG_TOGGLE_COLLAPSE = 'pinebery/toggle-collapse' as const
export const MSG_ACTIVATE_TAB = 'pinebery/activate-tab' as const
export const MSG_UPDATE_SETTINGS = 'pinebery/update-settings' as const
export const MSG_CREATE_PANEL = 'pinebery/create-panel' as const
export const MSG_CREATE_PANEL_RESPONSE = 'pinebery/create-panel-response' as const
export const MSG_UPDATE_PANEL = 'pinebery/update-panel' as const
export const MSG_DELETE_PANEL = 'pinebery/delete-panel' as const
export const MSG_REORDER_PANELS = 'pinebery/reorder-panels' as const
export const MSG_MOVE_TO_PANEL = 'pinebery/move-to-panel' as const
export const MSG_SET_ACTIVE_PANEL = 'pinebery/set-active-panel' as const
export const MSG_TOGGLE_PIN = 'pinebery/toggle-pin' as const
export const MSG_RENAME_TAB = 'pinebery/rename-tab' as const
export const MSG_CREATE_FOLDER = 'pinebery/create-folder' as const
export const MSG_CREATE_FOLDER_RESPONSE = 'pinebery/create-folder-response' as const

export interface TreeUpdatedMessage {
  type: typeof MSG_TREE_UPDATED
  state: StoredState
}

export interface RequestTreeMessage {
  type: typeof MSG_REQUEST_TREE
}

export interface MoveNodeMessage {
  type: typeof MSG_MOVE_NODE
  nodeId: NodeId
  newParentId: NodeId | null
  newIndex: number
  targetPanelId?: PanelId
}

export interface CloseNodeMessage {
  type: typeof MSG_CLOSE_NODE
  nodeId: NodeId
  mode: CloseParentBehavior
}

export interface ToggleCollapseMessage {
  type: typeof MSG_TOGGLE_COLLAPSE
  nodeId: NodeId
}

export interface ActivateTabMessage {
  type: typeof MSG_ACTIVATE_TAB
  nodeId: NodeId
}

export interface UpdateSettingsMessage {
  type: typeof MSG_UPDATE_SETTINGS
  patch: Partial<Settings>
}

export interface CreatePanelMessage {
  type: typeof MSG_CREATE_PANEL
  windowId: number
}

export interface CreatePanelResponse {
  type: typeof MSG_CREATE_PANEL_RESPONSE
  panelId: PanelId
}

export interface UpdatePanelMessage {
  type: typeof MSG_UPDATE_PANEL
  panelId: PanelId
  windowId: number
  patch: { name?: string; icon?: string; color?: GroupColor }
}

export interface DeletePanelMessage {
  type: typeof MSG_DELETE_PANEL
  panelId: PanelId
  windowId: number
}

export interface ReorderPanelsMessage {
  type: typeof MSG_REORDER_PANELS
  windowId: number
  orderedPanelIds: PanelId[]
}

export interface MoveToPanelMessage {
  type: typeof MSG_MOVE_TO_PANEL
  nodeId: NodeId
  targetPanelId: PanelId
  moveSubtree: boolean
}

export interface SetActivePanelMessage {
  type: typeof MSG_SET_ACTIVE_PANEL
  windowId: number
  panelId: PanelId
}

export interface TogglePinMessage {
  type: typeof MSG_TOGGLE_PIN
  nodeId: NodeId
}

export interface RenameTabMessage {
  type: typeof MSG_RENAME_TAB
  nodeId: NodeId
  customTitle: string | null
}

export interface CreateFolderMessage {
  type: typeof MSG_CREATE_FOLDER
  windowId: number
  panelId: PanelId
  parentId: NodeId | null
  title: string
}

export interface CreateFolderResponse {
  type: typeof MSG_CREATE_FOLDER_RESPONSE
  nodeId: NodeId
}

export type PineberyMessage =
  | TreeUpdatedMessage
  | RequestTreeMessage
  | MoveNodeMessage
  | CloseNodeMessage
  | ToggleCollapseMessage
  | ActivateTabMessage
  | UpdateSettingsMessage
  | CreatePanelMessage
  | CreatePanelResponse
  | UpdatePanelMessage
  | DeletePanelMessage
  | ReorderPanelsMessage
  | MoveToPanelMessage
  | SetActivePanelMessage
  | TogglePinMessage
  | RenameTabMessage
  | CreateFolderMessage
  | CreateFolderResponse
