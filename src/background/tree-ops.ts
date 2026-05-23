import type { NodeId, PanelId, StoredState, TreeNode, RenderEntry } from '../shared/types'

function cloneState(state: StoredState): StoredState {
  return structuredClone(state)
}

export function getNode(state: StoredState, nodeId: NodeId): TreeNode | null {
  for (const windowId of Object.keys(state.nodesByWindow)) {
    const bucket = state.nodesByWindow[Number(windowId)]
    if (bucket && bucket[nodeId]) {
      return bucket[nodeId]
    }
  }
  return null
}

export function findNodeByTabId(state: StoredState, tabId: number): TreeNode | null {
  for (const bucket of Object.values(state.nodesByWindow)) {
    for (const node of Object.values(bucket)) {
      if (node.tabId === tabId) return node
    }
  }
  return null
}

export function replaceTabId(
  state: StoredState,
  removedTabId: number,
  addedTabId: number,
): { state: StoredState; updated: boolean } {
  const node = findNodeByTabId(state, removedTabId)
  if (!node) return { state, updated: false }
  const next = cloneState(state)
  const target = next.nodesByWindow[node.windowId]?.[node.id]
  if (!target) return { state, updated: false }
  target.tabId = addedTabId
  return { state: next, updated: true }
}

function getNodeOrThrow(state: StoredState, nodeId: NodeId): TreeNode {
  const node = getNode(state, nodeId)
  if (!node) {
    throw new Error(`tree-ops: node not found: ${nodeId}`)
  }
  return node
}

function getRootOrder(state: StoredState, windowId: number, panelId: PanelId): NodeId[] {
  return state.rootOrderByWindow[windowId]?.[panelId] ?? []
}

function setRootOrder(state: StoredState, windowId: number, panelId: PanelId, order: NodeId[]): void {
  if (!state.rootOrderByWindow[windowId]) {
    state.rootOrderByWindow[windowId] = {}
  }
  state.rootOrderByWindow[windowId][panelId] = order
}

export function getSiblings(state: StoredState, nodeId: NodeId): NodeId[] {
  const node = getNodeOrThrow(state, nodeId)
  if (node.parentId === null) {
    const roots = getRootOrder(state, node.windowId, node.panelId)
    return roots.filter((id) => id !== nodeId)
  }
  const parent = getNodeOrThrow(state, node.parentId)
  return parent.childIds.filter((id) => id !== nodeId)
}

export function getDescendants(state: StoredState, nodeId: NodeId): NodeId[] {
  const node = getNode(state, nodeId)
  if (!node) {
    return []
  }
  const result: NodeId[] = []
  const stack: NodeId[] = [...node.childIds].reverse()
  while (stack.length > 0) {
    const currentId = stack.pop()!
    result.push(currentId)
    const current = getNode(state, currentId)
    if (current) {
      for (let i = current.childIds.length - 1; i >= 0; i--) {
        stack.push(current.childIds[i]!)
      }
    }
  }
  return result
}

export function isDescendantOf(
  state: StoredState,
  candidateId: NodeId,
  ancestorId: NodeId,
): boolean {
  if (candidateId === ancestorId) {
    return false
  }
  let current = getNode(state, candidateId)
  while (current && current.parentId !== null) {
    if (current.parentId === ancestorId) {
      return true
    }
    current = getNode(state, current.parentId)
  }
  return false
}

export function insertChild(
  state: StoredState,
  parentId: NodeId,
  node: TreeNode,
  index?: number,
): StoredState {
  const next = cloneState(state)
  const parent = next.nodesByWindow[getNodeOrThrow(next, parentId).windowId]?.[parentId]
  if (!parent) {
    throw new Error(`tree-ops: parent not found: ${parentId}`)
  }
  const child: TreeNode = {
    ...node,
    parentId,
    windowId: parent.windowId,
    panelId: parent.panelId,
  }
  const bucket = next.nodesByWindow[parent.windowId] ?? {}
  bucket[child.id] = child
  next.nodesByWindow[parent.windowId] = bucket
  if (index !== undefined) {
    const clamped = Math.max(0, Math.min(index, parent.childIds.length))
    const newChildIds = [...parent.childIds]
    newChildIds.splice(clamped, 0, child.id)
    parent.childIds = newChildIds
  } else {
    parent.childIds = [...parent.childIds, child.id]
  }
  return next
}

export function insertRoot(
  state: StoredState,
  windowId: number,
  panelId: PanelId,
  node: TreeNode,
  afterNodeId?: NodeId,
  atIndex?: number,
): StoredState {
  const next = cloneState(state)
  const root: TreeNode = {
    ...node,
    parentId: null,
    windowId,
    panelId,
  }
  const bucket = next.nodesByWindow[windowId] ?? {}
  bucket[root.id] = root
  next.nodesByWindow[windowId] = bucket
  const order = getRootOrder(next, windowId, panelId)
  if (atIndex !== undefined && afterNodeId === undefined) {
    const clamped = Math.max(0, Math.min(atIndex, order.length))
    order.splice(clamped, 0, root.id)
  } else if (afterNodeId === undefined) {
    order.push(root.id)
  } else {
    const index = order.indexOf(afterNodeId)
    if (index === -1) {
      order.push(root.id)
    } else {
      order.splice(index + 1, 0, root.id)
    }
  }
  setRootOrder(next, windowId, panelId, order)
  return next
}

function removeFromParentList(state: StoredState, nodeId: NodeId): number {
  const node = getNodeOrThrow(state, nodeId)
  if (node.parentId === null) {
    const order = getRootOrder(state, node.windowId, node.panelId)
    const index = order.indexOf(nodeId)
    if (index !== -1) {
      order.splice(index, 1)
    }
    setRootOrder(state, node.windowId, node.panelId, order)
    return index
  }
  const parent = getNodeOrThrow(state, node.parentId)
  const index = parent.childIds.indexOf(nodeId)
  if (index !== -1) {
    parent.childIds = [
      ...parent.childIds.slice(0, index),
      ...parent.childIds.slice(index + 1),
    ]
  }
  return index
}

function promoteChildren(
  state: StoredState,
  nodeId: NodeId,
  children: NodeId[],
  windowId: number,
  panelId: PanelId,
): void {
  const node = getNodeOrThrow(state, nodeId)
  if (node.parentId === null) {
    const order = getRootOrder(state, windowId, panelId)
    const rootIndex = order.indexOf(nodeId)
    const insertAt = rootIndex === -1 ? order.length : rootIndex
    order.splice(insertAt, 1, ...children)
    setRootOrder(state, windowId, panelId, order)
    for (const childId of children) {
      getNodeOrThrow(state, childId).parentId = null
    }
  } else {
    const parent = getNodeOrThrow(state, node.parentId)
    const childIndex = parent.childIds.indexOf(nodeId)
    const insertAt = childIndex === -1 ? parent.childIds.length : childIndex
    parent.childIds = [
      ...parent.childIds.slice(0, insertAt),
      ...children,
      ...parent.childIds.slice(insertAt + 1),
    ]
    for (const childId of children) {
      getNodeOrThrow(state, childId).parentId = parent.id
    }
  }
}

export function promoteToRoot(state: StoredState, nodeId: NodeId): StoredState {
  const node = getNodeOrThrow(state, nodeId)
  if (node.parentId === null) return state

  const next = cloneState(state)
  removeFromParentList(next, nodeId)

  const promoted = getNodeOrThrow(next, nodeId)
  promoted.parentId = null

  const order = getRootOrder(next, promoted.windowId, promoted.panelId)
  order.push(nodeId)
  setRootOrder(next, promoted.windowId, promoted.panelId, order)

  return next
}

export function moveNode(
  state: StoredState,
  nodeId: NodeId,
  newParentId: NodeId | null,
  newIndex: number,
  targetPanelId?: PanelId,
): StoredState {
  if (newParentId === nodeId) {
    throw new Error('tree-ops: cannot move a node into itself')
  }
  if (newParentId !== null && isDescendantOf(state, newParentId, nodeId)) {
    throw new Error('tree-ops: cannot move a node into its own descendant')
  }
  const sourceNode = getNodeOrThrow(state, nodeId)
  if (newParentId !== null) {
    const targetParent = getNodeOrThrow(state, newParentId)
    if (targetParent.windowId !== sourceNode.windowId) {
      throw new Error('tree-ops: cross-window moves are not supported')
    }
  }

  const next = cloneState(state)
  removeFromParentList(next, nodeId)

  const movedNode = getNodeOrThrow(next, nodeId)
  movedNode.parentId = newParentId

  if (newParentId === null) {
    const panelId = targetPanelId ?? movedNode.panelId
    movedNode.panelId = panelId
    const order = getRootOrder(next, movedNode.windowId, panelId)
    const clampedIndex = Math.max(0, Math.min(newIndex, order.length))
    order.splice(clampedIndex, 0, nodeId)
    setRootOrder(next, movedNode.windowId, panelId, order)
  } else {
    const newParent = getNodeOrThrow(next, newParentId)
    movedNode.panelId = newParent.panelId
    const clampedIndex = Math.max(0, Math.min(newIndex, newParent.childIds.length))
    newParent.childIds = [
      ...newParent.childIds.slice(0, clampedIndex),
      nodeId,
      ...newParent.childIds.slice(clampedIndex),
    ]
  }

  return next
}

export interface CloseNodeResult {
  state: StoredState
  removedTabIds: number[]
}

export function closeNode(
  state: StoredState,
  nodeId: NodeId,
  mode: 'promote' | 'subtree',
): CloseNodeResult {
  const target = getNodeOrThrow(state, nodeId)
  const windowId = target.windowId

  if (mode === 'subtree') {
    const descendants = getDescendants(state, nodeId)
    const removedIds = [nodeId, ...descendants]
    const removedTabIds = removedIds.map((id) => getNodeOrThrow(state, id).tabId)

    const next = cloneState(state)
    removeFromParentList(next, nodeId)
    const bucket = next.nodesByWindow[windowId] ?? {}
    for (const id of removedIds) {
      delete bucket[id]
    }
    next.nodesByWindow[windowId] = bucket
    return { state: next, removedTabIds }
  }

  const next = cloneState(state)
  const node = getNodeOrThrow(next, nodeId)
  const children = [...node.childIds]
  promoteChildren(next, nodeId, children, windowId, node.panelId)

  const bucket = next.nodesByWindow[windowId] ?? {}
  delete bucket[nodeId]
  next.nodesByWindow[windowId] = bucket

  return { state: next, removedTabIds: [target.tabId] }
}

export function reorderSiblings(
  state: StoredState,
  nodeId: NodeId,
  orderedSiblingIds: NodeId[],
): StoredState {
  const node = getNodeOrThrow(state, nodeId)
  const currentSiblings =
    node.parentId === null
      ? getRootOrder(state, node.windowId, node.panelId)
      : getNodeOrThrow(state, node.parentId).childIds
  const siblingSet = new Set(currentSiblings)

  if (orderedSiblingIds.length !== siblingSet.size) {
    throw new Error(
      'tree-ops: reorderSiblings must include exactly every current sibling',
    )
  }
  const seen = new Set<NodeId>()
  for (const id of orderedSiblingIds) {
    if (!siblingSet.has(id)) {
      throw new Error(`tree-ops: reorderSiblings received unknown sibling: ${id}`)
    }
    if (seen.has(id)) {
      throw new Error(`tree-ops: reorderSiblings received duplicate sibling: ${id}`)
    }
    seen.add(id)
  }

  const next = cloneState(state)
  if (node.parentId === null) {
    setRootOrder(next, node.windowId, node.panelId, [...orderedSiblingIds])
  } else {
    const parent = getNodeOrThrow(next, node.parentId)
    parent.childIds = [...orderedSiblingIds]
  }
  return next
}

export function setCustomTitle(
  state: StoredState,
  nodeId: NodeId,
  customTitle: string | null,
): StoredState {
  const node = getNode(state, nodeId)
  if (!node) return state
  const next = cloneState(state)
  const target = next.nodesByWindow[node.windowId]?.[nodeId]
  if (!target) return state
  const trimmed = customTitle?.trim() ?? ''
  if (trimmed === '') {
    delete target.customTitle
  } else {
    target.customTitle = trimmed
  }
  return next
}

export function toggleCollapse(state: StoredState, nodeId: NodeId): StoredState {
  const node = getNodeOrThrow(state, nodeId)
  const next = structuredClone(state)
  const target = next.nodesByWindow[node.windowId]?.[nodeId]
  if (target) {
    target.collapsed = !target.collapsed
  }
  return next
}

export function flattenForRender(
  state: StoredState,
  windowId: number,
  panelId: PanelId,
): RenderEntry[] {
  const result: RenderEntry[] = []
  const roots = getRootOrder(state, windowId, panelId)
  const stack: Array<{ id: NodeId; depth: number }> = []
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ id: roots[i]!, depth: 0 })
  }
  while (stack.length > 0) {
    const entry = stack.pop()!
    const node = getNode(state, entry.id)
    if (!node) {
      continue
    }
    result.push({ nodeId: entry.id, depth: entry.depth })
    if (node.collapsed) {
      continue
    }
    for (let i = node.childIds.length - 1; i >= 0; i--) {
      stack.push({ id: node.childIds[i]!, depth: entry.depth + 1 })
    }
  }
  return result
}

export function createPanel(
  state: StoredState,
  windowId: number,
  panel: import('../shared/types').Panel,
): StoredState {
  const next = cloneState(state)
  const panels = next.panelsByWindow[windowId] ?? []
  panels.push(panel)
  next.panelsByWindow[windowId] = panels
  const order = next.panelOrderByWindow[windowId] ?? []
  order.push(panel.id)
  next.panelOrderByWindow[windowId] = order
  if (!next.rootOrderByWindow[windowId]) {
    next.rootOrderByWindow[windowId] = {}
  }
  next.rootOrderByWindow[windowId][panel.id] = []
  return next
}

export interface DeletePanelResult {
  state: StoredState
  removedTabIds: number[]
}

export function deletePanel(
  state: StoredState,
  windowId: number,
  panelId: PanelId,
): DeletePanelResult {
  const next = cloneState(state)
  const roots = getRootOrder(next, windowId, panelId)
  const removedTabIds: number[] = []

  for (const rootId of roots) {
    const rootNode = getNode(next, rootId)
    if (rootNode) {
      removedTabIds.push(rootNode.tabId)
      const descendants = getDescendants(next, rootId)
      for (const descId of descendants) {
        const descNode = getNode(next, descId)
        if (descNode) removedTabIds.push(descNode.tabId)
      }
    }
  }

  const bucket = next.nodesByWindow[windowId]
  if (bucket) {
    for (const rootId of roots) {
      delete bucket[rootId]
      const descendants = getDescendants(state, rootId)
      for (const descId of descendants) {
        delete bucket[descId]
      }
    }
  }

  if (next.rootOrderByWindow[windowId]) {
    delete next.rootOrderByWindow[windowId][panelId]
  }

  next.panelsByWindow[windowId] = (next.panelsByWindow[windowId] ?? []).filter(
    (p) => p.id !== panelId,
  )
  next.panelOrderByWindow[windowId] = (next.panelOrderByWindow[windowId] ?? []).filter(
    (id) => id !== panelId,
  )

  if (next.activePanelByWindow[windowId] === panelId) {
    delete next.activePanelByWindow[windowId]
  }

  return { state: next, removedTabIds }
}

export function moveToPanel(
  state: StoredState,
  nodeId: NodeId,
  targetPanelId: PanelId,
  moveSubtree: boolean,
): StoredState {
  const node = getNodeOrThrow(state, nodeId)
  if (node.panelId === targetPanelId) return state

  const next = cloneState(state)
  const movingNode = getNodeOrThrow(next, nodeId)
  const windowId = movingNode.windowId

  if (moveSubtree) {
    removeFromParentList(next, nodeId)

    movingNode.parentId = null
    movingNode.panelId = targetPanelId
    const descendants = getDescendants(next, nodeId)
    for (const descId of descendants) {
      const desc = getNodeOrThrow(next, descId)
      desc.panelId = targetPanelId
    }

    const targetOrder = getRootOrder(next, windowId, targetPanelId)
    targetOrder.push(nodeId)
    setRootOrder(next, windowId, targetPanelId, targetOrder)
  } else {
    const children = [...movingNode.childIds]
    promoteChildren(next, nodeId, children, windowId, movingNode.panelId)

    movingNode.parentId = null
    movingNode.childIds = []
    movingNode.panelId = targetPanelId

    const targetOrder = getRootOrder(next, windowId, targetPanelId)
    targetOrder.push(nodeId)
    setRootOrder(next, windowId, targetPanelId, targetOrder)
  }

  return next
}

export function reorderPanels(
  state: StoredState,
  windowId: number,
  orderedPanelIds: PanelId[],
): StoredState {
  const currentOrder = state.panelOrderByWindow[windowId] ?? []
  const currentSet = new Set(currentOrder)

  if (orderedPanelIds.length !== currentSet.size) {
    throw new Error('tree-ops: reorderPanels must include exactly every current panel')
  }
  const seen = new Set<PanelId>()
  for (const id of orderedPanelIds) {
    if (!currentSet.has(id)) {
      throw new Error(`tree-ops: reorderPanels received unknown panel: ${id}`)
    }
    if (seen.has(id)) {
      throw new Error(`tree-ops: reorderPanels received duplicate panel: ${id}`)
    }
    seen.add(id)
  }

  const next = cloneState(state)
  next.panelOrderByWindow[windowId] = [...orderedPanelIds]
  return next
}
