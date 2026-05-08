import { describe, it, expect } from 'vitest'
import { computeDropTarget, type RowLayout } from '../../src/sidepanel/dnd/indent-dnd'
import {
  createEmptyState,
  DEFAULT_PANEL_ID,
  type NodeId,
  type StoredState,
  type TreeNode,
} from '../../src/shared/types'

const DEFAULT_WINDOW_ID = 1
const ROW_HEIGHT = 24
const INDENT_PX = 16

function makeNode(
  id: NodeId,
  tabId: number,
  overrides: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    tabId,
    windowId: DEFAULT_WINDOW_ID,
    url: `https://example.com/${id}`,
    title: `title-${id}`,
    parentId: null,
    childIds: [],
    collapsed: false,
    pinned: false,
    panelId: DEFAULT_PANEL_ID,
    ...overrides,
  }
}

function buildTree(): StoredState {
  const state = createEmptyState()
  const a = makeNode('a', 1, { childIds: ['a1', 'a2'] })
  const a1 = makeNode('a1', 2, { parentId: 'a', childIds: ['a1x'] })
  const a1x = makeNode('a1x', 3, { parentId: 'a1' })
  const a2 = makeNode('a2', 4, { parentId: 'a' })
  const b = makeNode('b', 5)

  state.nodesByWindow[DEFAULT_WINDOW_ID] = { a, a1, a1x, a2, b }
  state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [DEFAULT_PANEL_ID]: ['a', 'b'] }
  return state
}

function layoutFor(
  entries: Array<{ nodeId: NodeId; depth: number }>,
): RowLayout[] {
  return entries.map((entry, i) => ({
    nodeId: entry.nodeId,
    topPx: i * ROW_HEIGHT,
    bottomPx: (i + 1) * ROW_HEIGHT,
    depth: entry.depth,
  }))
}

const visibleTree = [
  { nodeId: 'a', depth: 0 },
  { nodeId: 'a1', depth: 1 },
  { nodeId: 'a1x', depth: 2 },
  { nodeId: 'a2', depth: 1 },
  { nodeId: 'b', depth: 0 },
]

function dropAt(
  state: StoredState,
  draggedNodeId: NodeId,
  rowIndex: number,
  fraction: number,
  cursorX: number,
) {
  const rowLayouts = layoutFor(visibleTree)
  const cursorY = rowIndex * ROW_HEIGHT + fraction * ROW_HEIGHT
  return computeDropTarget({
    rowLayouts,
    state,
    windowId: DEFAULT_WINDOW_ID,
    panelId: DEFAULT_PANEL_ID,
    draggedNodeId,
    cursorY,
    cursorX,
    indentPx: INDENT_PX,
  })
}

describe('computeDropTarget', () => {
  it('returns null rejection when the drop target is inside the dragged subtree', () => {
    const state = buildTree()
    const result = dropAt(state, 'a', 2, 0.9, 32)
    expect(result).toBeNull()
  })

  it('drops at the very top as first root', () => {
    const state = buildTree()
    const rowLayouts = layoutFor(visibleTree)
    const result = computeDropTarget({
      rowLayouts,
      state,
      windowId: DEFAULT_WINDOW_ID,
      panelId: DEFAULT_PANEL_ID,
      draggedNodeId: 'b',
      cursorY: 0,
      cursorX: 0,
      indentPx: INDENT_PX,
    })
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBeNull()
    expect(result!.newIndex).toBe(0)
    expect(result!.indicatorDepth).toBe(0)
  })

  it('drops at the very bottom as last root', () => {
    const state = buildTree()
    const rowLayouts = layoutFor(visibleTree)
    const result = computeDropTarget({
      rowLayouts,
      state,
      windowId: DEFAULT_WINDOW_ID,
      panelId: DEFAULT_PANEL_ID,
      draggedNodeId: 'a1x',
      cursorY: 5 * ROW_HEIGHT,
      cursorX: 0,
      indentPx: INDENT_PX,
    })
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBeNull()
    expect(result!.newIndex).toBe(2)
  })

  it('drops as child when cursor indents one level past the row above', () => {
    const state = buildTree()
    const result = dropAt(state, 'b', 0, 0.9, 24)
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBe('a')
    expect(result!.newIndex).toBe(0)
    expect(result!.indicatorDepth).toBe(1)
  })

  it('drops as sibling when cursor stays at the row above depth', () => {
    const state = buildTree()
    const result = dropAt(state, 'b', 3, 0.9, 16)
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBe('a')
    expect(result!.newIndex).toBe(2)
    expect(result!.indicatorDepth).toBe(1)
  })

  it('drops outdented when cursor moves left past the ancestor', () => {
    const state = buildTree()
    const result = dropAt(state, 'b', 2, 0.9, 0)
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBeNull()
    expect(result!.newIndex).toBe(1)
    expect(result!.indicatorDepth).toBe(0)
  })

  it('clamps indent depth to one level past the row above', () => {
    const state = buildTree()
    const result = dropAt(state, 'b', 0, 0.9, 9999)
    expect(result).not.toBeNull()
    expect(result!.indicatorDepth).toBe(1)
    expect(result!.newParentId).toBe('a')
  })

  it('rejects a cycle when dropping a node into its own descendant', () => {
    const state = buildTree()
    const result = dropAt(state, 'a', 2, 0.9, 32)
    expect(result).toBeNull()
  })

  it('adjusts newIndex down when dragged sibling sits before the insertion point', () => {
    const state = createEmptyState()
    const p = makeNode('p', 1, { childIds: ['c1', 'c2', 'c3'] })
    const c1 = makeNode('c1', 2, { parentId: 'p' })
    const c2 = makeNode('c2', 3, { parentId: 'p' })
    const c3 = makeNode('c3', 4, { parentId: 'p' })
    state.nodesByWindow[DEFAULT_WINDOW_ID] = { p, c1, c2, c3 }
    state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [DEFAULT_PANEL_ID]: ['p'] }

    const layout = layoutFor([
      { nodeId: 'p', depth: 0 },
      { nodeId: 'c1', depth: 1 },
      { nodeId: 'c2', depth: 1 },
      { nodeId: 'c3', depth: 1 },
    ])
    const result = computeDropTarget({
      rowLayouts: layout,
      state,
      windowId: DEFAULT_WINDOW_ID,
      panelId: DEFAULT_PANEL_ID,
      draggedNodeId: 'c1',
      cursorY: 2.9 * ROW_HEIGHT,
      cursorX: INDENT_PX,
      indentPx: INDENT_PX,
    })
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBe('p')
    expect(result!.newIndex).toBe(1)
  })

  it('keeps newIndex unchanged when dragged sibling sits after the insertion point', () => {
    const state = createEmptyState()
    const p = makeNode('p', 1, { childIds: ['c1', 'c2', 'c3'] })
    const c1 = makeNode('c1', 2, { parentId: 'p' })
    const c2 = makeNode('c2', 3, { parentId: 'p' })
    const c3 = makeNode('c3', 4, { parentId: 'p' })
    state.nodesByWindow[DEFAULT_WINDOW_ID] = { p, c1, c2, c3 }
    state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [DEFAULT_PANEL_ID]: ['p'] }

    const layout = layoutFor([
      { nodeId: 'p', depth: 0 },
      { nodeId: 'c1', depth: 1 },
      { nodeId: 'c2', depth: 1 },
      { nodeId: 'c3', depth: 1 },
    ])
    const result = computeDropTarget({
      rowLayouts: layout,
      state,
      windowId: DEFAULT_WINDOW_ID,
      panelId: DEFAULT_PANEL_ID,
      draggedNodeId: 'c3',
      cursorY: 1.9 * ROW_HEIGHT,
      cursorX: INDENT_PX,
      indentPx: INDENT_PX,
    })
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBe('p')
    expect(result!.newIndex).toBe(1)
  })

  it('handles empty tree gracefully', () => {
    const state = createEmptyState()
    state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [DEFAULT_PANEL_ID]: [] }
    const result = computeDropTarget({
      rowLayouts: [],
      state,
      windowId: DEFAULT_WINDOW_ID,
      panelId: DEFAULT_PANEL_ID,
      draggedNodeId: 'anything',
      cursorY: 0,
      cursorX: 0,
      indentPx: INDENT_PX,
    })
    expect(result).not.toBeNull()
    expect(result!.newParentId).toBeNull()
    expect(result!.newIndex).toBe(0)
  })
})
