import type { NodeId, PanelId, StoredState } from '../../shared/types'
import { getNode, isDescendantOf } from '../../background/tree-ops'

export interface RowLayout {
  nodeId: NodeId
  topPx: number
  bottomPx: number
  depth: number
}

export interface DropTargetInput {
  rowLayouts: RowLayout[]
  state: StoredState
  windowId: number
  panelId: PanelId
  draggedNodeId: NodeId
  cursorY: number
  cursorX: number
  indentPx: number
  previousDepth?: number
}

const DEPTH_HOLD_FRACTION = 0.4

function resolveRawDepth(
  cursorX: number,
  indentPx: number,
  previousDepth: number | undefined,
): number {
  const bandDepth = Math.max(0, Math.floor(cursorX / indentPx))
  if (previousDepth === undefined) return bandDepth

  const holdMargin = indentPx * DEPTH_HOLD_FRACTION
  const lowerBound = previousDepth * indentPx - holdMargin
  const upperBound = (previousDepth + 1) * indentPx + holdMargin
  if (cursorX >= lowerBound && cursorX < upperBound) return previousDepth
  return bandDepth
}

export interface DropTarget {
  newParentId: NodeId | null
  newIndex: number
  indicatorY: number
  indicatorDepth: number
}

export function computeDropTarget(input: DropTargetInput): DropTarget | null {
  const {
    rowLayouts,
    state,
    windowId,
    panelId,
    draggedNodeId,
    cursorY,
    cursorX,
    indentPx,
    previousDepth,
  } = input

  let slotIndex = 0
  for (let i = 0; i < rowLayouts.length; i++) {
    const midY = (rowLayouts[i]!.topPx + rowLayouts[i]!.bottomPx) / 2
    if (cursorY >= midY) {
      slotIndex = i + 1
    } else {
      break
    }
  }

  const beforeRow = slotIndex > 0 ? rowLayouts[slotIndex - 1]! : null

  let indicatorY: number
  if (rowLayouts.length === 0) {
    indicatorY = 0
  } else if (!beforeRow) {
    indicatorY = rowLayouts[0]!.topPx
  } else if (slotIndex >= rowLayouts.length) {
    indicatorY = beforeRow.bottomPx
  } else {
    indicatorY = (beforeRow.bottomPx + rowLayouts[slotIndex]!.topPx) / 2
  }

  const maxDepth = beforeRow ? beforeRow.depth + 1 : 0
  const rawDepth = resolveRawDepth(cursorX, indentPx, previousDepth)
  const targetDepth = Math.max(0, Math.min(rawDepth, maxDepth))

  let newParentId: NodeId | null = null
  if (targetDepth > 0 && beforeRow) {
    let current = getNode(state, beforeRow.nodeId)
    let currentDepth = beforeRow.depth
    while (current && currentDepth > targetDepth - 1) {
      current = current.parentId ? getNode(state, current.parentId) : null
      currentDepth -= 1
    }
    newParentId = current?.id ?? null
  }

  if (newParentId === draggedNodeId) return null
  if (newParentId && isDescendantOf(state, newParentId, draggedNodeId)) return null

  const siblings =
    newParentId === null
      ? (state.rootOrderByWindow[windowId]?.[panelId] ?? [])
      : (state.nodesByWindow[windowId]?.[newParentId]?.childIds ?? [])

  let newIndex = siblings.length
  if (!beforeRow) {
    newIndex = 0
  } else {
    let current = getNode(state, beforeRow.nodeId)
    let resolved = false
    while (current) {
      if (current.id === newParentId) {
        newIndex = 0
        resolved = true
        break
      }
      if (current.parentId === newParentId) {
        newIndex = siblings.indexOf(current.id) + 1
        resolved = true
        break
      }
      current = current.parentId ? getNode(state, current.parentId) : null
    }
    if (!resolved) {
      newIndex = siblings.length
    }
  }

  const draggedNode = getNode(state, draggedNodeId)
  if (draggedNode) {
    const draggedIsSibling =
      (newParentId === null &&
        draggedNode.parentId === null &&
        draggedNode.windowId === windowId) ||
      draggedNode.parentId === newParentId
    if (draggedIsSibling) {
      const draggedCurrentIndex = siblings.indexOf(draggedNodeId)
      if (draggedCurrentIndex !== -1 && draggedCurrentIndex < newIndex) {
        newIndex -= 1
      }
    }
  }

  return {
    newParentId,
    newIndex,
    indicatorY,
    indicatorDepth: targetDepth,
  }
}
