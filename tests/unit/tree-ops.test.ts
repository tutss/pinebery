import { describe, it, expect } from 'vitest'
import {
  createEmptyState,
  DEFAULT_PANEL_ID,
  type StoredState,
  type TreeNode,
  type NodeId,
  type Panel,
} from '../../src/shared/types'
import {
  insertChild,
  insertRoot,
  moveNode,
  closeNode,
  flattenForRender,
  getNode,
  getSiblings,
  getDescendants,
  isDescendantOf,
  reorderSiblings,
  createPanel,
  deletePanel,
  moveToPanel,
  reorderPanels,
  replaceTabId,
  findNodeByTabId,
  setCustomTitle,
  promoteToRoot,
  enforcePinnedLeaves,
  createFolder,
} from '../../src/background/tree-ops'
import { buildFolderNode } from '../../src/shared/node-factory'

const DEFAULT_WINDOW_ID = 1
const P = DEFAULT_PANEL_ID

function makeNode(id: NodeId, tabId: number, overrides: Partial<TreeNode> = {}): TreeNode {
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

function makePanel(id: string, windowId: number = DEFAULT_WINDOW_ID): Panel {
  return { id, name: `Panel ${id}`, icon: '📁', color: 'grey', windowId }
}

function buildBasicTree(): StoredState {
  let state = createEmptyState()
  state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
  state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('b', 2))
  state = insertChild(state, 'a', makeNode('a1', 3))
  state = insertChild(state, 'a', makeNode('a2', 4))
  state = insertChild(state, 'a1', makeNode('a1x', 5))
  return state
}

function rootOrder(state: StoredState, windowId: number = DEFAULT_WINDOW_ID, panelId: string = P): NodeId[] {
  return state.rootOrderByWindow[windowId]?.[panelId] ?? []
}

function makeFolder(id: NodeId, title = `folder-${id}`): TreeNode {
  return buildFolderNode(id, DEFAULT_WINDOW_ID, P, title)
}

describe('insertRoot', () => {
  it('inserts a root at the end when afterNodeId is omitted', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r2', 11))
    expect(rootOrder(state)).toEqual(['r1', 'r2'])
  })

  it('inserts a root after the given afterNodeId', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r2', 11))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r3', 12), 'r1')
    expect(rootOrder(state)).toEqual(['r1', 'r3', 'r2'])
  })

  it('falls back to append when afterNodeId is unknown', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r2', 11), 'unknown')
    expect(rootOrder(state)).toEqual(['r1', 'r2'])
  })

  it('forces parentId to null and windowId to the given window', () => {
    let state = createEmptyState()
    state = insertRoot(
      state,
      7,
      P,
      makeNode('r1', 10, { parentId: 'ghost', windowId: 999 }),
    )
    const stored = getNode(state, 'r1')!
    expect(stored.parentId).toBeNull()
    expect(stored.windowId).toBe(7)
  })

  it('stamps panelId on the inserted node', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'work', makeNode('r1', 10))
    const stored = getNode(state, 'r1')!
    expect(stored.panelId).toBe('work')
  })

  it('inserts at position 0 when atIndex is 0', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r2', 11))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r0', 12), undefined, 0)
    expect(rootOrder(state)).toEqual(['r0', 'r1', 'r2'])
  })

  it('atIndex in the middle inserts at that position', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r2', 11))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r3', 12))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('mid', 13), undefined, 1)
    expect(rootOrder(state)).toEqual(['r1', 'mid', 'r2', 'r3'])
  })
})

describe('insertChild', () => {
  it('appends children in order under the parent', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('p', 1))
    state = insertChild(state, 'p', makeNode('c1', 2))
    state = insertChild(state, 'p', makeNode('c2', 3))
    state = insertChild(state, 'p', makeNode('c3', 4))
    const parent = getNode(state, 'p')!
    expect(parent.childIds).toEqual(['c1', 'c2', 'c3'])
  })

  it('inherits windowId and panelId from the parent', () => {
    let state = createEmptyState()
    state = insertRoot(state, 42, P, makeNode('p', 1, { windowId: 42 }))
    state = insertChild(state, 'p', makeNode('c', 2, { windowId: 999 }))
    const child = getNode(state, 'c')!
    expect(child.windowId).toBe(42)
    expect(child.parentId).toBe('p')
  })

  it('throws when the parent does not exist', () => {
    const state = createEmptyState()
    expect(() => insertChild(state, 'ghost', makeNode('c', 1))).toThrow()
  })

  it('inserts at index 0 as first child', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('p', 1))
    state = insertChild(state, 'p', makeNode('c1', 2))
    state = insertChild(state, 'p', makeNode('c2', 3))
    state = insertChild(state, 'p', makeNode('first', 4), 0)
    const parent = getNode(state, 'p')!
    expect(parent.childIds).toEqual(['first', 'c1', 'c2'])
  })

  it('inserts at a mid-range index', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('p', 1))
    state = insertChild(state, 'p', makeNode('c1', 2))
    state = insertChild(state, 'p', makeNode('c2', 3))
    state = insertChild(state, 'p', makeNode('c3', 4))
    state = insertChild(state, 'p', makeNode('mid', 5), 1)
    const parent = getNode(state, 'p')!
    expect(parent.childIds).toEqual(['c1', 'mid', 'c2', 'c3'])
  })

  it('clamps index beyond length to append', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('p', 1))
    state = insertChild(state, 'p', makeNode('c1', 2))
    state = insertChild(state, 'p', makeNode('last', 3), 999)
    const parent = getNode(state, 'p')!
    expect(parent.childIds).toEqual(['c1', 'last'])
  })
})

describe('getNode, getSiblings, getDescendants, isDescendantOf', () => {
  it('getNode returns null for unknown ids', () => {
    const state = buildBasicTree()
    expect(getNode(state, 'ghost')).toBeNull()
  })

  it('getSiblings returns other children under the same parent', () => {
    const state = buildBasicTree()
    expect(getSiblings(state, 'a1')).toEqual(['a2'])
  })

  it('getSiblings returns other roots when the node is a root', () => {
    const state = buildBasicTree()
    expect(getSiblings(state, 'a')).toEqual(['b'])
  })

  it('getDescendants returns empty for a leaf', () => {
    const state = buildBasicTree()
    expect(getDescendants(state, 'a2')).toEqual([])
  })

  it('getDescendants returns all descendants in DFS order', () => {
    const state = buildBasicTree()
    expect(getDescendants(state, 'a')).toEqual(['a1', 'a1x', 'a2'])
  })

  it('isDescendantOf is true for a deep descendant', () => {
    const state = buildBasicTree()
    expect(isDescendantOf(state, 'a1x', 'a')).toBe(true)
  })

  it('isDescendantOf is false for a sibling', () => {
    const state = buildBasicTree()
    expect(isDescendantOf(state, 'a2', 'a1')).toBe(false)
  })

  it('isDescendantOf is false when checking against self', () => {
    const state = buildBasicTree()
    expect(isDescendantOf(state, 'a', 'a')).toBe(false)
  })
})

describe('moveNode', () => {
  it('moves a root to become a child', () => {
    let state = buildBasicTree()
    state = moveNode(state, 'b', 'a', 0)
    const a = getNode(state, 'a')!
    expect(a.childIds).toEqual(['b', 'a1', 'a2'])
    expect(getNode(state, 'b')!.parentId).toBe('a')
    expect(rootOrder(state)).toEqual(['a'])
  })

  it('moves a child out to become a root', () => {
    let state = buildBasicTree()
    state = moveNode(state, 'a1', null, 0, P)
    expect(rootOrder(state)).toEqual(['a1', 'a', 'b'])
    expect(getNode(state, 'a1')!.parentId).toBeNull()
    expect(getNode(state, 'a')!.childIds).toEqual(['a2'])
  })

  it('moves a child to a different parent', () => {
    let state = buildBasicTree()
    state = moveNode(state, 'a2', 'b', 0)
    expect(getNode(state, 'a')!.childIds).toEqual(['a1'])
    expect(getNode(state, 'b')!.childIds).toEqual(['a2'])
    expect(getNode(state, 'a2')!.parentId).toBe('b')
  })

  it('reorders siblings under the same parent', () => {
    let state = buildBasicTree()
    state = moveNode(state, 'a2', 'a', 0)
    expect(getNode(state, 'a')!.childIds).toEqual(['a2', 'a1'])
  })

  it('rejects moving a node into itself', () => {
    const state = buildBasicTree()
    expect(() => moveNode(state, 'a', 'a', 0)).toThrow()
  })

  it('rejects moving a node into its own descendant', () => {
    const state = buildBasicTree()
    expect(() => moveNode(state, 'a', 'a1x', 0)).toThrow()
  })

  it('clamps newIndex when larger than the target list length', () => {
    let state = buildBasicTree()
    state = moveNode(state, 'b', 'a', 999)
    expect(getNode(state, 'a')!.childIds).toEqual(['a1', 'a2', 'b'])
  })

  it('does not mutate the input state', () => {
    const state = buildBasicTree()
    const snapshot = structuredClone(state)
    moveNode(state, 'a2', 'b', 0)
    expect(state).toEqual(snapshot)
  })
})

describe('closeNode promote', () => {
  it('promotes children to grandparent at the original index', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('gp', 1))
    state = insertChild(state, 'gp', makeNode('x', 2))
    state = insertChild(state, 'gp', makeNode('p', 3))
    state = insertChild(state, 'gp', makeNode('y', 4))
    state = insertChild(state, 'p', makeNode('c1', 5))
    state = insertChild(state, 'p', makeNode('c2', 6))

    const result = closeNode(state, 'p', 'promote')
    const gp = getNode(result.state, 'gp')!
    expect(gp.childIds).toEqual(['x', 'c1', 'c2', 'y'])
    expect(getNode(result.state, 'c1')!.parentId).toBe('gp')
    expect(getNode(result.state, 'c2')!.parentId).toBe('gp')
    expect(getNode(result.state, 'p')).toBeNull()
    expect(result.removedTabIds).toEqual([3])
  })

  it('promotes children to roots when the closed node is a root', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r', 2))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('b', 3))
    state = insertChild(state, 'r', makeNode('c1', 4))
    state = insertChild(state, 'r', makeNode('c2', 5))

    const result = closeNode(state, 'r', 'promote')
    expect(rootOrder(result.state)).toEqual(['a', 'c1', 'c2', 'b'])
    expect(getNode(result.state, 'c1')!.parentId).toBeNull()
    expect(getNode(result.state, 'c2')!.parentId).toBeNull()
  })

  it('closes a leaf node with no children', () => {
    let state = buildBasicTree()
    const result = closeNode(state, 'a1x', 'promote')
    expect(getNode(result.state, 'a1x')).toBeNull()
    expect(getNode(result.state, 'a1')!.childIds).toEqual([])
    expect(result.removedTabIds).toEqual([5])
  })
})

describe('closeNode subtree', () => {
  it('returns the removed tab ids in DFS order', () => {
    const state = buildBasicTree()
    const result = closeNode(state, 'a', 'subtree')
    expect(result.removedTabIds).toEqual([1, 3, 5, 4])
  })

  it('removes all descendants from storage', () => {
    const state = buildBasicTree()
    const result = closeNode(state, 'a', 'subtree')
    expect(getNode(result.state, 'a')).toBeNull()
    expect(getNode(result.state, 'a1')).toBeNull()
    expect(getNode(result.state, 'a1x')).toBeNull()
    expect(getNode(result.state, 'a2')).toBeNull()
    expect(getNode(result.state, 'b')).not.toBeNull()
    expect(rootOrder(result.state)).toEqual(['b'])
  })

  it('handles a single-node subtree close', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('only', 99))
    const result = closeNode(state, 'only', 'subtree')
    expect(result.removedTabIds).toEqual([99])
    expect(rootOrder(result.state)).toEqual([])
  })

  it('closes a deep 4-level subtree', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('l0', 100))
    state = insertChild(state, 'l0', makeNode('l1', 101))
    state = insertChild(state, 'l1', makeNode('l2', 102))
    state = insertChild(state, 'l2', makeNode('l3', 103))
    const result = closeNode(state, 'l0', 'subtree')
    expect(result.removedTabIds).toEqual([100, 101, 102, 103])
  })
})

describe('reorderSiblings', () => {
  it('reorders root siblings to match the provided ordering', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('b', 2))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('c', 3))
    state = reorderSiblings(state, 'a', ['c', 'a', 'b'])
    expect(rootOrder(state)).toEqual(['c', 'a', 'b'])
  })

  it('reorders a nested child list to match the provided ordering', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('p', 1))
    state = insertChild(state, 'p', makeNode('c1', 2))
    state = insertChild(state, 'p', makeNode('c2', 3))
    state = insertChild(state, 'p', makeNode('c3', 4))
    state = reorderSiblings(state, 'c2', ['c3', 'c1', 'c2'])
    expect(getNode(state, 'p')!.childIds).toEqual(['c3', 'c1', 'c2'])
  })

  it('is a no-op when the order matches the current order', () => {
    const state = buildBasicTree()
    const next = reorderSiblings(state, 'a1', ['a1', 'a2'])
    expect(getNode(next, 'a')!.childIds).toEqual(['a1', 'a2'])
  })

  it('throws when the provided ordering omits a sibling', () => {
    const state = buildBasicTree()
    expect(() => reorderSiblings(state, 'a1', ['a1'])).toThrow()
  })

  it('throws when the provided ordering includes unknown ids', () => {
    const state = buildBasicTree()
    expect(() => reorderSiblings(state, 'a1', ['a1', 'a2', 'ghost'])).toThrow()
  })

  it('does not mutate the input state', () => {
    const state = buildBasicTree()
    const snapshot = structuredClone(state)
    reorderSiblings(state, 'a1', ['a2', 'a1'])
    expect(state).toEqual(snapshot)
  })
})

describe('flattenForRender', () => {
  it('produces a DFS walk with correct depths', () => {
    const state = buildBasicTree()
    const flat = flattenForRender(state, DEFAULT_WINDOW_ID, P)
    expect(flat).toEqual([
      { nodeId: 'a', depth: 0 },
      { nodeId: 'a1', depth: 1 },
      { nodeId: 'a1x', depth: 2 },
      { nodeId: 'a2', depth: 1 },
      { nodeId: 'b', depth: 0 },
    ])
  })

  it('skips descendants of a collapsed node', () => {
    let state = buildBasicTree()
    const a1 = getNode(state, 'a1')!
    state = structuredClone(state)
    state.nodesByWindow[DEFAULT_WINDOW_ID]![a1.id]!.collapsed = true
    const flat = flattenForRender(state, DEFAULT_WINDOW_ID, P)
    expect(flat.map((entry) => entry.nodeId)).toEqual(['a', 'a1', 'a2', 'b'])
  })

  it('returns an empty list for an unknown window', () => {
    const state = buildBasicTree()
    expect(flattenForRender(state, 9999, P)).toEqual([])
  })

  it('returns an empty list for an unknown panel', () => {
    const state = buildBasicTree()
    expect(flattenForRender(state, DEFAULT_WINDOW_ID, 'nonexistent')).toEqual([])
  })

  it('handles deeply nested collapsed branches', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('r', 1))
    state = insertChild(state, 'r', makeNode('c', 2))
    state = insertChild(state, 'c', makeNode('d', 3))
    state = insertChild(state, 'd', makeNode('e', 4))
    state = structuredClone(state)
    state.nodesByWindow[DEFAULT_WINDOW_ID]!['c']!.collapsed = true
    const flat = flattenForRender(state, DEFAULT_WINDOW_ID, P)
    expect(flat).toEqual([
      { nodeId: 'r', depth: 0 },
      { nodeId: 'c', depth: 1 },
    ])
  })
})

describe('createPanel', () => {
  it('creates a panel with an empty root list', () => {
    let state = createEmptyState()
    const panel = makePanel('work')
    state = createPanel(state, DEFAULT_WINDOW_ID, panel)
    expect(state.panelsByWindow[DEFAULT_WINDOW_ID]).toEqual([panel])
    expect(state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual(['work'])
    expect(rootOrder(state, DEFAULT_WINDOW_ID, 'work')).toEqual([])
  })

  it('appends to existing panels', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('a'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('b'))
    expect(state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual(['a', 'b'])
    expect(state.panelsByWindow[DEFAULT_WINDOW_ID]).toHaveLength(2)
  })
})

describe('deletePanel', () => {
  it('removes a panel and returns all tab ids', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'work', makeNode('t1', 10))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'work', makeNode('t2', 11))
    state = insertChild(state, 't1', makeNode('t1c', 12))

    const result = deletePanel(state, DEFAULT_WINDOW_ID, 'work')
    expect(result.removedTabIds).toContain(10)
    expect(result.removedTabIds).toContain(11)
    expect(result.removedTabIds).toContain(12)
    expect(result.state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual([])
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'work')).toEqual([])
    expect(getNode(result.state, 't1')).toBeNull()
    expect(getNode(result.state, 't2')).toBeNull()
    expect(getNode(result.state, 't1c')).toBeNull()
  })

  it('does not affect other panels', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('keep'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('remove'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'keep', makeNode('k1', 1))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'remove', makeNode('r1', 2))

    const result = deletePanel(state, DEFAULT_WINDOW_ID, 'remove')
    expect(getNode(result.state, 'k1')).not.toBeNull()
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'keep')).toEqual(['k1'])
    expect(result.state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual(['keep'])
  })

  it('clears activePanelByWindow entry when the active panel is deleted', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = structuredClone(state)
    state.activePanelByWindow[DEFAULT_WINDOW_ID] = 'work'

    const result = deletePanel(state, DEFAULT_WINDOW_ID, 'work')
    expect(result.state.activePanelByWindow[DEFAULT_WINDOW_ID]).toBeUndefined()
  })

  it('preserves activePanelByWindow entry when a non-active panel is deleted', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('keep'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('remove'))
    state = structuredClone(state)
    state.activePanelByWindow[DEFAULT_WINDOW_ID] = 'keep'

    const result = deletePanel(state, DEFAULT_WINDOW_ID, 'remove')
    expect(result.state.activePanelByWindow[DEFAULT_WINDOW_ID]).toBe('keep')
  })
})

describe('moveToPanel', () => {
  it('moves a root node with subtree to another panel', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel(P))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertChild(state, 'a', makeNode('a1', 2))
    state = insertChild(state, 'a1', makeNode('a1x', 3))

    state = moveToPanel(state, 'a', 'work', true)
    expect(rootOrder(state, DEFAULT_WINDOW_ID, P)).toEqual([])
    expect(rootOrder(state, DEFAULT_WINDOW_ID, 'work')).toEqual(['a'])
    expect(getNode(state, 'a')!.panelId).toBe('work')
    expect(getNode(state, 'a1')!.panelId).toBe('work')
    expect(getNode(state, 'a1x')!.panelId).toBe('work')
    expect(getNode(state, 'a')!.parentId).toBeNull()
    expect(getNode(state, 'a')!.childIds).toEqual(['a1'])
  })

  it('moves only the node without subtree, promoting children', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel(P))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertChild(state, 'a', makeNode('a1', 2))
    state = insertChild(state, 'a', makeNode('a2', 3))

    state = moveToPanel(state, 'a', 'work', false)
    expect(rootOrder(state, DEFAULT_WINDOW_ID, P)).toEqual(['a1', 'a2'])
    expect(rootOrder(state, DEFAULT_WINDOW_ID, 'work')).toEqual(['a'])
    expect(getNode(state, 'a1')!.parentId).toBeNull()
    expect(getNode(state, 'a2')!.parentId).toBeNull()
    expect(getNode(state, 'a')!.childIds).toEqual([])
    expect(getNode(state, 'a')!.panelId).toBe('work')
    expect(getNode(state, 'a1')!.panelId).toBe(P)
  })

  it('moves a child node with subtree to another panel', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel(P))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('parent', 1))
    state = insertChild(state, 'parent', makeNode('child', 2))
    state = insertChild(state, 'child', makeNode('grandchild', 3))

    state = moveToPanel(state, 'child', 'work', true)
    expect(getNode(state, 'parent')!.childIds).toEqual([])
    expect(rootOrder(state, DEFAULT_WINDOW_ID, 'work')).toEqual(['child'])
    expect(getNode(state, 'child')!.parentId).toBeNull()
    expect(getNode(state, 'child')!.panelId).toBe('work')
    expect(getNode(state, 'grandchild')!.panelId).toBe('work')
  })

  it('returns unchanged state when target panel is the same', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    const result = moveToPanel(state, 'a', P, true)
    expect(result).toBe(state)
  })

  it('moves a nested node whose stored panelId drifted from the panel it renders in', () => {
    // A nested node can end up with a panelId that disagrees with the panel its
    // tree actually renders in (e.g. after rehydration re-parents it across
    // panels). Rendering follows the tree, so the move must too — comparing the
    // stored panelId against the target would silently no-op a real move.
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel(P))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'work', makeNode('a', 1))
    state = insertChild(state, 'a', makeNode('b', 2))
    state.nodesByWindow[DEFAULT_WINDOW_ID]!['b']!.panelId = P // drift

    // b is displayed under a in "work" even though its stored panelId says P.
    expect(flattenForRender(state, DEFAULT_WINDOW_ID, 'work').map((e) => e.nodeId)).toEqual([
      'a',
      'b',
    ])

    const result = moveToPanel(state, 'b', P, true)
    expect(result).not.toBe(state)
    expect(getNode(result, 'b')!.panelId).toBe(P)
    expect(getNode(result, 'b')!.parentId).toBeNull()
    expect(rootOrder(result, DEFAULT_WINDOW_ID, P)).toEqual(['b'])
    expect(rootOrder(result, DEFAULT_WINDOW_ID, 'work')).toEqual(['a'])
  })

  it('still no-ops when the node already renders in the target panel', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel(P))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertChild(state, 'a', makeNode('b', 2))
    // b's effective panel is P (its root ancestor a is in P).
    expect(moveToPanel(state, 'b', P, true)).toBe(state)
  })
})

describe('reorderPanels', () => {
  it('reorders panels to match the provided ordering', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('a'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('b'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('c'))
    state = reorderPanels(state, DEFAULT_WINDOW_ID, ['c', 'a', 'b'])
    expect(state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual(['c', 'a', 'b'])
  })

  it('throws when the ordering omits a panel', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('a'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('b'))
    expect(() => reorderPanels(state, DEFAULT_WINDOW_ID, ['a'])).toThrow()
  })

  it('throws when the ordering includes unknown panels', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('a'))
    expect(() => reorderPanels(state, DEFAULT_WINDOW_ID, ['a', 'ghost'])).toThrow()
  })

  it('throws on duplicates', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('a'))
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('b'))
    expect(() => reorderPanels(state, DEFAULT_WINDOW_ID, ['a', 'a'])).toThrow()
  })
})

describe('replaceTabId', () => {
  it('updates the tabId of the matching node', () => {
    const state = buildBasicTree()
    const result = replaceTabId(state, 3, 999)
    expect(result.updated).toBe(true)
    const node = findNodeByTabId(result.state, 999)
    expect(node?.id).toBe('a1')
    expect(findNodeByTabId(result.state, 3)).toBeNull()
  })

  it('is a no-op when removedTabId does not match any node', () => {
    const state = buildBasicTree()
    const result = replaceTabId(state, 12345, 67890)
    expect(result.updated).toBe(false)
    expect(result.state).toBe(state)
  })

  it('does not mutate the original state', () => {
    const state = buildBasicTree()
    const originalNode = findNodeByTabId(state, 3)
    const result = replaceTabId(state, 3, 999)
    expect(result.state).not.toBe(state)
    expect(originalNode?.tabId).toBe(3)
    expect(findNodeByTabId(state, 3)?.tabId).toBe(3)
  })

  it('preserves tree shape and ordering', () => {
    const state = buildBasicTree()
    const result = replaceTabId(state, 3, 999)
    expect(rootOrder(result.state)).toEqual(rootOrder(state))
    const aNode = getNode(result.state, 'a')!
    expect(aNode.childIds).toEqual(['a1', 'a2'])
    const a1Node = getNode(result.state, 'a1')!
    expect(a1Node.childIds).toEqual(['a1x'])
    expect(a1Node.parentId).toBe('a')
  })
})

describe('setCustomTitle', () => {
  it('assigns a trimmed custom title on the target node', () => {
    const state = buildBasicTree()
    const next = setCustomTitle(state, 'a1', '  Renamed  ')
    expect(getNode(next, 'a1')?.customTitle).toBe('Renamed')
  })

  it('does not mutate the input state', () => {
    const state = buildBasicTree()
    setCustomTitle(state, 'a1', 'Renamed')
    expect(getNode(state, 'a1')?.customTitle).toBeUndefined()
  })

  it('clears the custom title when given null', () => {
    let state = buildBasicTree()
    state = setCustomTitle(state, 'a1', 'Renamed')
    state = setCustomTitle(state, 'a1', null)
    expect(getNode(state, 'a1')?.customTitle).toBeUndefined()
  })

  it('clears the custom title when given an empty string', () => {
    let state = buildBasicTree()
    state = setCustomTitle(state, 'a1', 'Renamed')
    state = setCustomTitle(state, 'a1', '   ')
    expect(getNode(state, 'a1')?.customTitle).toBeUndefined()
  })

  it('returns the same reference when the node does not exist', () => {
    const state = buildBasicTree()
    const next = setCustomTitle(state, 'missing-node', 'Renamed')
    expect(next).toBe(state)
  })

  it('leaves the original title untouched', () => {
    const state = buildBasicTree()
    const next = setCustomTitle(state, 'a1', 'Renamed')
    expect(getNode(next, 'a1')?.title).toBe('title-a1')
  })
})

describe('promoteToRoot', () => {
  it('moves a child node to root level', () => {
    const state = buildBasicTree()
    const next = promoteToRoot(state, 'a1x')
    expect(getNode(next, 'a1x')?.parentId).toBeNull()
    expect(getNode(next, 'a1')?.childIds).not.toContain('a1x')
    const roots = next.rootOrderByWindow[DEFAULT_WINDOW_ID]![P]!
    expect(roots).toContain('a1x')
  })

  it('returns same state when node is already a root', () => {
    const state = buildBasicTree()
    const next = promoteToRoot(state, 'a')
    expect(next).toBe(state)
  })
})

describe('enforcePinnedLeaves', () => {
  it('returns the same state untouched when no pinned tab has children', () => {
    const state = buildBasicTree()
    const next = enforcePinnedLeaves(state)
    expect(next).toBe(state)
  })

  it('promotes a child of a pinned tab to a root', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('pin', 1, { pinned: true }))
    state = insertChild(state, 'pin', makeNode('child', 2))

    const next = enforcePinnedLeaves(state)
    expect(getNode(next, 'pin')?.childIds).toEqual([])
    expect(getNode(next, 'child')?.parentId).toBeNull()
    expect(rootOrder(next)).toContain('child')
  })

  it('keeps the promoted tab in its own panel and preserves its subtree', () => {
    let state = createEmptyState()
    state = createPanel(state, DEFAULT_WINDOW_ID, makePanel('work'))
    state = insertRoot(state, DEFAULT_WINDOW_ID, 'work', makeNode('pin', 1, { pinned: true }))
    state = insertChild(state, 'pin', makeNode('child', 2))
    state = insertChild(state, 'child', makeNode('grandchild', 3))

    const next = enforcePinnedLeaves(state)
    expect(getNode(next, 'child')?.parentId).toBeNull()
    expect(getNode(next, 'child')?.panelId).toBe('work')
    expect(getNode(next, 'child')?.childIds).toEqual(['grandchild'])
    expect(getNode(next, 'grandchild')?.parentId).toBe('child')
    expect(rootOrder(next, DEFAULT_WINDOW_ID, 'work')).toContain('child')
  })

  it('promotes a pinned tab that is itself nested under another pinned tab', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('outer', 1, { pinned: true }))
    state = insertChild(state, 'outer', makeNode('inner', 2, { pinned: true }))

    const next = enforcePinnedLeaves(state)
    expect(getNode(next, 'outer')?.childIds).toEqual([])
    expect(getNode(next, 'inner')?.parentId).toBeNull()
    expect(getNode(next, 'inner')?.pinned).toBe(true)
    expect(rootOrder(next)).toEqual(expect.arrayContaining(['outer', 'inner']))
  })
})

describe('createFolder', () => {
  it('inserts a folder as a panel root', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), null)

    const folder = getNode(state, 'f')!
    expect(folder.kind).toBe('folder')
    expect(folder.tabId).toBeUndefined()
    expect(folder.parentId).toBeNull()
    expect(rootOrder(state)).toEqual(['a', 'f'])
  })

  it('inserts a folder at a specific root index', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('b', 2))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), null, 1)
    expect(rootOrder(state)).toEqual(['a', 'f', 'b'])
  })

  it('inserts a folder as a child of a tab node', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), 'a')

    expect(getNode(state, 'a')?.childIds).toEqual(['f'])
    expect(getNode(state, 'f')?.parentId).toBe('a')
  })

  it('supports folders nested inside folders', () => {
    let state = createEmptyState()
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('outer'), null)
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('inner'), 'outer')

    expect(getNode(state, 'outer')?.childIds).toEqual(['inner'])
    expect(getNode(state, 'inner')?.kind).toBe('folder')
    expect(getNode(state, 'inner')?.parentId).toBe('outer')
  })

  it('lets a tab be re-parented into a folder via moveNode', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), null)
    state = moveNode(state, 'a', 'f', 0)

    expect(getNode(state, 'a')?.parentId).toBe('f')
    expect(getNode(state, 'f')?.childIds).toEqual(['a'])
    expect(rootOrder(state)).toEqual(['f'])
  })
})

describe('closeNode with folders', () => {
  it('promotes a folder\'s children and removes no tabs for the folder itself', () => {
    let state = createEmptyState()
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), null)
    state = insertChild(state, 'f', makeNode('a', 1))
    state = insertChild(state, 'f', makeNode('b', 2))

    const result = closeNode(state, 'f', 'promote')
    expect(result.removedTabIds).toEqual([])
    expect(getNode(result.state, 'f')).toBeNull()
    expect(getNode(result.state, 'a')?.parentId).toBeNull()
    expect(getNode(result.state, 'b')?.parentId).toBeNull()
    expect(rootOrder(result.state)).toEqual(['a', 'b'])
  })

  it('closes only the real tab descendants when deleting a folder subtree', () => {
    let state = createEmptyState()
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), null)
    state = insertChild(state, 'f', makeNode('a', 1))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('nested'), 'f')
    state = insertChild(state, 'nested', makeNode('b', 2))

    const result = closeNode(state, 'f', 'subtree')
    expect(result.removedTabIds.sort()).toEqual([1, 2])
    expect(getNode(result.state, 'f')).toBeNull()
    expect(getNode(result.state, 'nested')).toBeNull()
    expect(getNode(result.state, 'a')).toBeNull()
    expect(getNode(result.state, 'b')).toBeNull()
  })

  it('promoting a tab parent keeps a nested folder child intact', () => {
    let state = createEmptyState()
    state = insertRoot(state, DEFAULT_WINDOW_ID, P, makeNode('a', 1))
    state = createFolder(state, DEFAULT_WINDOW_ID, P, makeFolder('f'), 'a')

    const result = closeNode(state, 'a', 'promote')
    expect(result.removedTabIds).toEqual([1])
    expect(getNode(result.state, 'f')?.parentId).toBeNull()
    expect(rootOrder(result.state)).toEqual(['f'])
  })
})
