import { describe, it, expect } from 'vitest'
import { rehydrate } from '../../src/background/persistence'
import {
  createEmptyState,
  DEFAULT_PANEL_ID,
  type NodeId,
  type StoredState,
  type TreeNode,
} from '../../src/shared/types'
import { buildFolderNode } from '../../src/shared/node-factory'

const DEFAULT_WINDOW_ID = 1
const P = DEFAULT_PANEL_ID

function makeFakeTab(
  overrides: Partial<chrome.tabs.Tab> & { id: number; windowId?: number; index?: number },
): chrome.tabs.Tab {
  const base = {
    windowId: DEFAULT_WINDOW_ID,
    index: 0,
    url: `https://example.com/${overrides.id}`,
    title: `tab-${overrides.id}`,
    pinned: false,
    highlighted: false,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
  }
  return { ...base, ...overrides } as chrome.tabs.Tab
}

function makePriorNode(
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

function buildPriorState(nodes: TreeNode[], rootIds: NodeId[]): StoredState {
  const state = createEmptyState()
  for (const node of nodes) {
    const bucket = state.nodesByWindow[node.windowId] ?? {}
    bucket[node.id] = node
    state.nodesByWindow[node.windowId] = bucket
  }
  state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [P]: rootIds }
  state.panelsByWindow[DEFAULT_WINDOW_ID] = [
    { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: DEFAULT_WINDOW_ID },
  ]
  state.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P]
  return state
}

function makeIdGenerator(prefix: string) {
  let counter = 0
  return () => `${prefix}-${counter++}`
}

function rootOrder(state: StoredState, windowId: number = DEFAULT_WINDOW_ID, panelId: string = P): NodeId[] {
  return state.rootOrderByWindow[windowId]?.[panelId] ?? []
}

describe('rehydrate', () => {
  it('returns empty state when there are no tabs', () => {
    const result = rehydrate([], null, makeIdGenerator('n'))
    expect(result.state.nodesByWindow).toEqual({})
    expect(result.state.rootOrderByWindow).toEqual({})
  })

  it('assigns fresh node ids to all tabs on first run', () => {
    const tabs = [
      makeFakeTab({ id: 10, index: 0 }),
      makeFakeTab({ id: 11, index: 1 }),
    ]
    const result = rehydrate(tabs, null, makeIdGenerator('n'))
    expect(rootOrder(result.state)).toEqual(['n-0', 'n-1'])
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['n-0']!.tabId).toBe(10)
    expect(bucket['n-1']!.tabId).toBe(11)
  })

  it('creates default panel on first run', () => {
    const tabs = [makeFakeTab({ id: 10, index: 0 })]
    const result = rehydrate(tabs, null, makeIdGenerator('n'))
    expect(result.state.panelsByWindow[DEFAULT_WINDOW_ID]).toHaveLength(1)
    expect(result.state.panelsByWindow[DEFAULT_WINDOW_ID]![0]!.id).toBe(P)
    expect(result.state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual([P])
  })

  it('uses openerTabId to parent fresh tabs under their opener', () => {
    const tabs = [
      makeFakeTab({ id: 10, index: 0 }),
      makeFakeTab({ id: 11, index: 1, openerTabId: 10 }),
      makeFakeTab({ id: 12, index: 2, openerTabId: 11 }),
    ]
    const result = rehydrate(tabs, null, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['n-0']!.parentId).toBeNull()
    expect(bucket['n-1']!.parentId).toBe('n-0')
    expect(bucket['n-2']!.parentId).toBe('n-1')
    expect(bucket['n-0']!.childIds).toEqual(['n-1'])
    expect(bucket['n-1']!.childIds).toEqual(['n-2'])
  })

  it('preserves prior tree structure when tab ids match', () => {
    const priorRoot = makePriorNode('root', 100, { childIds: ['c1', 'c2'] })
    const priorC1 = makePriorNode('c1', 101, { parentId: 'root' })
    const priorC2 = makePriorNode('c2', 102, { parentId: 'root' })
    const prior = buildPriorState([priorRoot, priorC1, priorC2], ['root'])

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 101, index: 1 }),
      makeFakeTab({ id: 102, index: 2 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['root']!.tabId).toBe(100)
    expect(bucket['c1']!.parentId).toBe('root')
    expect(bucket['c2']!.parentId).toBe('root')
    expect(bucket['root']!.childIds).toEqual(['c1', 'c2'])
    expect(rootOrder(result.state)).toEqual(['root'])
  })

  it('drops prior nodes whose tabs no longer exist', () => {
    const a = makePriorNode('a', 1)
    const b = makePriorNode('b', 2)
    const c = makePriorNode('c', 3)
    const prior = buildPriorState([a, b, c], ['a', 'b', 'c'])

    const tabs = [
      makeFakeTab({ id: 1, index: 0 }),
      makeFakeTab({ id: 3, index: 1 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(Object.keys(bucket).sort()).toEqual(['a', 'c'])
    expect(rootOrder(result.state)).toEqual(['a', 'c'])
  })

  it('promotes a node to root when its prior parent tab no longer exists', () => {
    const parent = makePriorNode('p', 1, { childIds: ['child'] })
    const child = makePriorNode('child', 2, { parentId: 'p' })
    const prior = buildPriorState([parent, child], ['p'])

    const tabs = [makeFakeTab({ id: 2, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['child']!.parentId).toBeNull()
    expect(rootOrder(result.state)).toEqual(['child'])
  })

  it('promotes a tab nested under a pinned tab to a root (recovers hidden tabs)', () => {
    const pinned = makePriorNode('pin', 1, { pinned: true, childIds: ['child'] })
    const child = makePriorNode('child', 2, { parentId: 'pin' })
    const prior = buildPriorState([pinned, child], ['pin'])

    const tabs = [
      makeFakeTab({ id: 1, index: 0, pinned: true }),
      makeFakeTab({ id: 2, index: 1 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['pin']!.pinned).toBe(true)
    expect(bucket['pin']!.childIds).toEqual([])
    expect(bucket['child']!.parentId).toBeNull()
    expect(rootOrder(result.state)).toContain('child')
  })

  it('rebuilds from scratch when no prior tab ids match (browser restart scenario)', () => {
    const priorRoot = makePriorNode('root', 100, { childIds: ['c1'] })
    const priorC1 = makePriorNode('c1', 101, { parentId: 'root' })
    const prior = buildPriorState([priorRoot, priorC1], ['root'])

    const tabs = [
      makeFakeTab({ id: 500, index: 0 }),
      makeFakeTab({ id: 501, index: 1, openerTabId: 500 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['root']).toBeUndefined()
    expect(bucket['c1']).toBeUndefined()
    expect(bucket['fresh-0']!.parentId).toBeNull()
    expect(bucket['fresh-1']!.parentId).toBe('fresh-0')
  })

  it('updates tab metadata from the current Chrome tab', () => {
    const prior = buildPriorState(
      [makePriorNode('x', 1, { title: 'old', url: 'https://old.example', pinned: false })],
      ['x'],
    )
    const tabs = [
      makeFakeTab({
        id: 1,
        index: 0,
        title: 'new title',
        url: 'https://new.example',
        pinned: true,
        favIconUrl: 'https://icon.example/f.ico',
      }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const node = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!['x']!
    expect(node.title).toBe('new title')
    expect(node.url).toBe('https://new.example')
    expect(node.pinned).toBe(true)
    expect(node.favIconUrl).toBe('https://icon.example/f.ico')
    expect(node.tabId).toBe(1)
  })

  it('carries over collapsed state from prior nodes when tab id matches', () => {
    const priorRoot = makePriorNode('r', 1, { collapsed: true })
    const prior = buildPriorState([priorRoot], ['r'])
    const tabs = [makeFakeTab({ id: 1, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    expect(result.state.nodesByWindow[DEFAULT_WINDOW_ID]!['r']!.collapsed).toBe(true)
  })

  it('handles multiple windows independently', () => {
    const tabs = [
      makeFakeTab({ id: 1, index: 0, windowId: 10 }),
      makeFakeTab({ id: 2, index: 1, windowId: 10, openerTabId: 1 }),
      makeFakeTab({ id: 3, index: 0, windowId: 20 }),
    ]
    const result = rehydrate(tabs, null, makeIdGenerator('n'))
    expect(Object.keys(result.state.nodesByWindow).sort()).toEqual(['10', '20'])
    expect(rootOrder(result.state, 10)).toEqual(['n-0'])
    expect(rootOrder(result.state, 20)).toEqual(['n-2'])
    expect(result.state.nodesByWindow[10]!['n-0']!.childIds).toEqual(['n-1'])
  })

  it('does not parent a new tab via openerTabId during session continuation', () => {
    const priorRoot = makePriorNode('root', 100)
    const prior = buildPriorState([priorRoot], ['root'])

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 200, index: 1, openerTabId: 100 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['root']!.tabId).toBe(100)
    const newNode = bucket['n-0']!
    expect(newNode.tabId).toBe(200)
    expect(newNode.parentId).toBeNull()
    expect(rootOrder(result.state)).toEqual(['root', 'n-0'])
  })

  it('recovers tree structure across tabId change when URLs match', () => {
    const grandparent = makePriorNode('gp', 100, {
      url: 'https://a.test',
      childIds: ['parent'],
    })
    const parent = makePriorNode('parent', 101, {
      url: 'https://b.test',
      parentId: 'gp',
      childIds: ['child'],
    })
    const child = makePriorNode('child', 102, {
      url: 'https://c.test',
      parentId: 'parent',
    })
    const prior = buildPriorState([grandparent, parent, child], ['gp'])

    const tabs = [
      makeFakeTab({ id: 200, index: 0, url: 'https://a.test' }),
      makeFakeTab({ id: 201, index: 1, url: 'https://b.test' }),
      makeFakeTab({ id: 202, index: 2, url: 'https://c.test' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['gp']!.tabId).toBe(200)
    expect(bucket['parent']!.tabId).toBe(201)
    expect(bucket['child']!.tabId).toBe(202)
    expect(bucket['gp']!.parentId).toBeNull()
    expect(bucket['parent']!.parentId).toBe('gp')
    expect(bucket['child']!.parentId).toBe('parent')
    expect(bucket['gp']!.childIds).toEqual(['parent'])
    expect(bucket['parent']!.childIds).toEqual(['child'])
    expect(rootOrder(result.state)).toEqual(['gp'])
  })

  it('skips ambiguous URL matches with no tiebreaker', () => {
    const a = makePriorNode('a', 100, { url: 'https://shared.test', title: 'Same' })
    const b = makePriorNode('b', 101, { url: 'https://shared.test', title: 'Same' })
    const prior = buildPriorState([a, b], ['a', 'b'])

    const tabs = [
      makeFakeTab({ id: 200, index: 0, url: 'https://shared.test', title: 'Same' }),
      makeFakeTab({ id: 201, index: 1, url: 'https://shared.test', title: 'Same' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['a']).toBeUndefined()
    expect(bucket['b']).toBeUndefined()
    expect(Object.keys(bucket).sort()).toEqual(['fresh-0', 'fresh-1'])
  })

  it('disambiguates URL matches by title', () => {
    const a = makePriorNode('a', 100, {
      url: 'https://shared.test',
      title: 'Issue 1',
      childIds: ['ac'],
    })
    const ac = makePriorNode('ac', 102, {
      url: 'https://issue1.test',
      title: 'Issue 1 Detail',
      parentId: 'a',
    })
    const b = makePriorNode('b', 101, { url: 'https://shared.test', title: 'Issue 2' })
    const prior = buildPriorState([a, ac, b], ['a', 'b'])

    const tabs = [
      makeFakeTab({ id: 200, index: 0, url: 'https://shared.test', title: 'Issue 1' }),
      makeFakeTab({ id: 201, index: 1, url: 'https://issue1.test', title: 'Issue 1 Detail' }),
      makeFakeTab({ id: 202, index: 2, url: 'https://shared.test', title: 'Issue 2' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['a']!.tabId).toBe(200)
    expect(bucket['b']!.tabId).toBe(202)
    expect(bucket['ac']!.tabId).toBe(201)
    expect(bucket['ac']!.parentId).toBe('a')
  })

  it('treats genuinely new tab as fresh when no URL match', () => {
    const root = makePriorNode('root', 100, { url: 'https://known.test' })
    const prior = buildPriorState([root], ['root'])

    const tabs = [
      makeFakeTab({ id: 200, index: 0, url: 'https://known.test' }),
      makeFakeTab({ id: 201, index: 1, url: 'https://brand-new.test', openerTabId: 200 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['root']!.tabId).toBe(200)
    const newNode = bucket['fresh-0']!
    expect(newNode.tabId).toBe(201)
    expect(newNode.parentId).toBeNull()
  })

  it('does not override tabId match with URL match', () => {
    const a = makePriorNode('a', 100, { url: 'https://shared.test', title: 'Same' })
    const b = makePriorNode('b', 999, { url: 'https://shared.test', title: 'Same' })
    const prior = buildPriorState([a, b], ['a', 'b'])

    const tabs = [
      makeFakeTab({ id: 100, index: 0, url: 'https://shared.test', title: 'Same' }),
      makeFakeTab({ id: 101, index: 1, url: 'https://shared.test', title: 'Same' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['a']!.tabId).toBe(100)
    expect(bucket['a']).toBeDefined()
    const otherIds = Object.keys(bucket).filter((id) => id !== 'a')
    expect(otherIds).toHaveLength(1)
    const otherNode = bucket[otherIds[0]!]!
    expect(otherNode.tabId).toBe(101)
  })

  it('handles mixed tabId match + URL match', () => {
    const a = makePriorNode('a', 100, { url: 'https://a.test', childIds: ['b'] })
    const b = makePriorNode('b', 101, { url: 'https://b.test', parentId: 'a' })
    const prior = buildPriorState([a, b], ['a'])

    const tabs = [
      makeFakeTab({ id: 100, index: 0, url: 'https://a.test' }),
      makeFakeTab({ id: 999, index: 1, url: 'https://b.test' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['a']!.tabId).toBe(100)
    expect(bucket['b']!.tabId).toBe(999)
    expect(bucket['b']!.parentId).toBe('a')
    expect(bucket['a']!.childIds).toEqual(['b'])
  })

  it('recovers tree across windowId change via URL match', () => {
    const a = makePriorNode('a', 100, { url: 'https://a.test', childIds: ['b'] })
    const b = makePriorNode('b', 101, { url: 'https://b.test', parentId: 'a' })
    const prior = buildPriorState([a, b], ['a'])

    const tabs = [
      makeFakeTab({ id: 200, index: 0, windowId: 5, url: 'https://a.test' }),
      makeFakeTab({ id: 201, index: 1, windowId: 5, url: 'https://b.test' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('fresh'))
    const bucket = result.state.nodesByWindow[5]!
    expect(bucket['a']!.parentId).toBeNull()
    expect(bucket['b']!.parentId).toBe('a')
    expect(bucket['a']!.childIds).toEqual(['b'])
    expect(rootOrder(result.state, 5)).toEqual(['a'])
  })

  it('preserves panel definitions from prior state', () => {
    const prior = buildPriorState([], [])
    prior.panelsByWindow[DEFAULT_WINDOW_ID] = [
      { id: P, name: 'Custom', icon: '🏠', color: 'blue', windowId: DEFAULT_WINDOW_ID },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: DEFAULT_WINDOW_ID },
    ]
    prior.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P, 'work']

    const tabs = [makeFakeTab({ id: 1, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    expect(result.state.panelsByWindow[DEFAULT_WINDOW_ID]).toHaveLength(2)
    expect(result.state.panelOrderByWindow[DEFAULT_WINDOW_ID]).toEqual([P, 'work'])
  })

  it('preserves valid activePanelByWindow entries and drops stale ones', () => {
    const prior = buildPriorState([], [])
    prior.panelsByWindow[DEFAULT_WINDOW_ID] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: DEFAULT_WINDOW_ID },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: DEFAULT_WINDOW_ID },
    ]
    prior.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P, 'work']
    prior.activePanelByWindow = {
      [DEFAULT_WINDOW_ID]: 'work',
      99: 'deleted-panel',
    }

    const tabs = [makeFakeTab({ id: 1, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    expect(result.state.activePanelByWindow[DEFAULT_WINDOW_ID]).toBe('work')
    expect(result.state.activePanelByWindow[99]).toBeUndefined()
  })
})

describe('rehydrate panel persistence across window ID change', () => {
  it('remaps panels to new window IDs when tabs match by URL', () => {
    const OLD_WINDOW = 1
    const NEW_WINDOW = 99

    const a = makePriorNode('a', 100, { url: 'https://a.test', windowId: OLD_WINDOW })
    const prior = buildPriorState([a], ['a'])
    prior.panelsByWindow[OLD_WINDOW] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: OLD_WINDOW },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: OLD_WINDOW },
    ]
    prior.panelOrderByWindow[OLD_WINDOW] = [P, 'work']
    prior.activePanelByWindow = { [OLD_WINDOW]: 'work' }

    const tabs = [
      makeFakeTab({ id: 500, index: 0, windowId: NEW_WINDOW, url: 'https://a.test' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))

    expect(result.state.panelsByWindow[NEW_WINDOW]).toHaveLength(2)
    expect(result.state.panelsByWindow[NEW_WINDOW]![0]!.windowId).toBe(NEW_WINDOW)
    expect(result.state.panelsByWindow[NEW_WINDOW]![1]!.name).toBe('Work')
    expect(result.state.panelsByWindow[NEW_WINDOW]![1]!.windowId).toBe(NEW_WINDOW)
    expect(result.state.panelOrderByWindow[NEW_WINDOW]).toEqual([P, 'work'])
    expect(result.state.activePanelByWindow[NEW_WINDOW]).toBe('work')

    expect(result.state.panelsByWindow[OLD_WINDOW]).toBeUndefined()
    expect(result.state.panelOrderByWindow[OLD_WINDOW]).toBeUndefined()
  })

  it('reassigns a root stranded in a non-existent panel to the first valid panel', () => {
    const stranded = makePriorNode('stranded', 100, { panelId: 'ghost-panel' })
    const normal = makePriorNode('normal', 101, { panelId: P })
    const prior = buildPriorState([stranded, normal], ['normal'])
    prior.rootOrderByWindow[DEFAULT_WINDOW_ID]!['ghost-panel'] = ['stranded']

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 101, index: 1 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!

    expect(bucket['stranded']!.panelId).toBe(P)
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, P)).toContain('stranded')
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'ghost-panel')).toEqual([])
  })

  it('moves the whole subtree of a stranded root into the valid panel', () => {
    const root = makePriorNode('root', 100, { panelId: 'ghost-panel', childIds: ['kid'] })
    const kid = makePriorNode('kid', 101, { panelId: 'ghost-panel', parentId: 'root' })
    const prior = buildPriorState([root, kid], [])
    prior.rootOrderByWindow[DEFAULT_WINDOW_ID]!['ghost-panel'] = ['root']

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 101, index: 1 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!

    expect(bucket['root']!.panelId).toBe(P)
    expect(bucket['kid']!.panelId).toBe(P)
    expect(bucket['root']!.childIds).toEqual(['kid'])
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, P)).toContain('root')
  })

  it('keeps a prior root in its own panel even when its opener survives', () => {
    // "child" was deliberately placed as a root in panel P (a blank new tab
    // opened while P was active, or a tab moved/promoted there), but Chrome
    // still records child.openerTabId === work-root's tab for the tab's whole
    // lifetime. A service worker restart must not re-nest it under work-root
    // and drag it into the "work" panel.
    const workRoot = makePriorNode('work-root', 100, { panelId: 'work' })
    const child = makePriorNode('child', 101, { panelId: P })
    const prior = buildPriorState([workRoot, child], ['child'])
    prior.panelsByWindow[DEFAULT_WINDOW_ID] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: DEFAULT_WINDOW_ID },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: DEFAULT_WINDOW_ID },
    ]
    prior.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P, 'work']
    prior.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [P]: ['child'], work: ['work-root'] }

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 101, index: 1, openerTabId: 100 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!

    expect(bucket['child']!.parentId).toBeNull()
    expect(bucket['child']!.panelId).toBe(P)
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, P)).toEqual(['child'])
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'work')).toEqual(['work-root'])
  })

  it('aligns a tab re-parented across panels with its new root panel', () => {
    // "child" lived under "gone" in panel P, but gone's tab no longer exists,
    // so the prior parent link is lost and rehydrate falls back to Chrome's
    // openerTabId, which points at "work-root" in panel "work". The re-nested
    // child's panelId must follow the tree into "work" — otherwise the tab
    // can no longer be moved out of it.
    const workRoot = makePriorNode('work-root', 100, { panelId: 'work' })
    const gone = makePriorNode('gone', 999, { panelId: P, childIds: ['child'] })
    const child = makePriorNode('child', 101, { panelId: P, parentId: 'gone' })
    const prior = buildPriorState([workRoot, gone, child], ['gone'])
    prior.panelsByWindow[DEFAULT_WINDOW_ID] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: DEFAULT_WINDOW_ID },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: DEFAULT_WINDOW_ID },
    ]
    prior.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P, 'work']
    prior.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [P]: ['gone'], work: ['work-root'] }

    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 101, index: 1, openerTabId: 100 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!

    expect(bucket['child']!.parentId).toBe('work-root')
    expect(bucket['child']!.panelId).toBe('work')
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'work')).toEqual(['work-root'])
  })

  it('leaves roots assigned to real custom panels untouched', () => {
    const work = makePriorNode('work-root', 100, { panelId: 'work' })
    const prior = buildPriorState([work], [])
    prior.panelsByWindow[DEFAULT_WINDOW_ID] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: DEFAULT_WINDOW_ID },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: DEFAULT_WINDOW_ID },
    ]
    prior.panelOrderByWindow[DEFAULT_WINDOW_ID] = [P, 'work']
    prior.rootOrderByWindow[DEFAULT_WINDOW_ID]!['work'] = ['work-root']

    const tabs = [makeFakeTab({ id: 100, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!

    expect(bucket['work-root']!.panelId).toBe('work')
    expect(rootOrder(result.state, DEFAULT_WINDOW_ID, 'work')).toEqual(['work-root'])
  })

  it('preserves node panelId assignments across window ID change', () => {
    const OLD_WINDOW = 1
    const NEW_WINDOW = 42

    const a = makePriorNode('a', 100, { url: 'https://a.test', windowId: OLD_WINDOW, panelId: 'work' })
    const b = makePriorNode('b', 101, { url: 'https://b.test', windowId: OLD_WINDOW, panelId: P })
    const prior = buildPriorState([a, b], ['b'])
    prior.rootOrderByWindow[OLD_WINDOW]!['work'] = ['a']
    prior.panelsByWindow[OLD_WINDOW] = [
      { id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: OLD_WINDOW },
      { id: 'work', name: 'Work', icon: '💼', color: 'red', windowId: OLD_WINDOW },
    ]
    prior.panelOrderByWindow[OLD_WINDOW] = [P, 'work']

    const tabs = [
      makeFakeTab({ id: 500, index: 0, windowId: NEW_WINDOW, url: 'https://a.test' }),
      makeFakeTab({ id: 501, index: 1, windowId: NEW_WINDOW, url: 'https://b.test' }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))

    const bucket = result.state.nodesByWindow[NEW_WINDOW]!
    expect(bucket['a']!.panelId).toBe('work')
    expect(bucket['b']!.panelId).toBe(P)
    expect(result.state.panelsByWindow[NEW_WINDOW]).toHaveLength(2)
    expect(rootOrder(result.state, NEW_WINDOW, 'work')).toEqual(['a'])
    expect(rootOrder(result.state, NEW_WINDOW, P)).toEqual(['b'])
  })
})

describe('rehydrate customTitle', () => {
  it('carries customTitle forward when prior matches by tabId', () => {
    const prior = buildPriorState(
      [makePriorNode('p1', 100, { customTitle: 'My label' })],
      ['p1'],
    )
    const tabs = [makeFakeTab({ id: 100, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['p1']?.customTitle).toBe('My label')
  })

  it('carries customTitle forward when prior matches by URL fallback (browser restart)', () => {
    const prior = buildPriorState(
      [
        makePriorNode('p1', 100, {
          url: 'https://example.com/keep',
          customTitle: 'My label',
        }),
      ],
      ['p1'],
    )
    const tabs = [
      makeFakeTab({ id: 999, url: 'https://example.com/keep', index: 0 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['p1']?.customTitle).toBe('My label')
  })

  it('leaves customTitle unset when prior had none and match is by tabId', () => {
    const prior = buildPriorState([makePriorNode('p1', 100)], ['p1'])
    const tabs = [makeFakeTab({ id: 100, index: 0 })]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['p1']?.customTitle).toBeUndefined()
  })

  it('pinned tabs stay as roots even when openerTabId would reparent them', () => {
    const prior = buildPriorState(
      [makePriorNode('opener', 100), makePriorNode('pinned', 200, { pinned: true })],
      ['opener', 'pinned'],
    )
    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 200, index: 1, pinned: true, openerTabId: 100 }),
    ]
    const result = rehydrate(tabs, prior, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['pinned']?.parentId).toBeNull()
    expect(bucket['pinned']?.pinned).toBe(true)
    expect(rootOrder(result.state)).toContain('pinned')
  })

  it('pinned tabs without prior state stay as roots despite openerTabId', () => {
    const tabs = [
      makeFakeTab({ id: 100, index: 0 }),
      makeFakeTab({ id: 200, index: 1, pinned: true, openerTabId: 100 }),
    ]
    const result = rehydrate(tabs, null, makeIdGenerator('n'))
    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    const pinnedNode = Object.values(bucket).find((n) => n.tabId === 200)!
    expect(pinnedNode.parentId).toBeNull()
    expect(pinnedNode.pinned).toBe(true)
  })
})

function makePriorFolder(id: NodeId, overrides: Partial<TreeNode> = {}): TreeNode {
  return { ...buildFolderNode(id, DEFAULT_WINDOW_ID, P, `folder-${id}`), ...overrides }
}

describe('rehydrate with folders', () => {
  it('preserves an empty folder across a restart', () => {
    const prior = buildPriorState(
      [makePriorNode('a', 1), makePriorFolder('f')],
      ['a', 'f'],
    )
    const result = rehydrate([makeFakeTab({ id: 1, index: 0 })], prior, makeIdGenerator('n'))

    const folder = result.state.nodesByWindow[DEFAULT_WINDOW_ID]?.['f']
    expect(folder?.kind).toBe('folder')
    expect(folder?.childIds).toEqual([])
    expect(folder?.tabId).toBeUndefined()
    expect(rootOrder(result.state)).toEqual(['a', 'f'])
  })

  it('keeps a tab nested under its folder across a restart', () => {
    const prior = buildPriorState(
      [makePriorFolder('f'), makePriorNode('a', 1, { parentId: 'f' })],
      ['f'],
    )
    const result = rehydrate([makeFakeTab({ id: 1, index: 0 })], prior, makeIdGenerator('n'))

    expect(result.state.nodesByWindow[DEFAULT_WINDOW_ID]?.['a']?.parentId).toBe('f')
    expect(result.state.nodesByWindow[DEFAULT_WINDOW_ID]?.['f']?.childIds).toEqual(['a'])
    expect(rootOrder(result.state)).toEqual(['f'])
  })

  it('preserves nested folders with a tab in the inner folder', () => {
    const prior = buildPriorState(
      [
        makePriorFolder('o'),
        makePriorFolder('i', { parentId: 'o' }),
        makePriorNode('a', 1, { parentId: 'i' }),
      ],
      ['o'],
    )
    const result = rehydrate([makeFakeTab({ id: 1, index: 0 })], prior, makeIdGenerator('n'))

    const bucket = result.state.nodesByWindow[DEFAULT_WINDOW_ID]!
    expect(bucket['o']?.childIds).toEqual(['i'])
    expect(bucket['i']?.parentId).toBe('o')
    expect(bucket['i']?.childIds).toEqual(['a'])
    expect(bucket['a']?.parentId).toBe('i')
    expect(rootOrder(result.state)).toEqual(['o'])
  })

  it('carries folders into the remapped window after a browser restart', () => {
    // Prior state lived in window 5; after restart the tab reopens in window 9.
    const prior = createEmptyState()
    const folder = buildFolderNode('f', 5, P, 'folder-f')
    const tab: TreeNode = {
      id: 'a',
      kind: 'tab',
      tabId: 1,
      windowId: 5,
      url: 'https://example.com/a',
      title: 'title-a',
      parentId: 'f',
      childIds: [],
      collapsed: false,
      pinned: false,
      panelId: P,
    }
    prior.nodesByWindow[5] = { f: folder, a: tab }
    prior.rootOrderByWindow[5] = { [P]: ['f'] }
    prior.panelsByWindow[5] = [{ id: P, name: 'Tabs', icon: '📄', color: 'grey', windowId: 5 }]
    prior.panelOrderByWindow[5] = [P]

    const result = rehydrate(
      [makeFakeTab({ id: 1, windowId: 9, index: 0 })],
      prior,
      makeIdGenerator('n'),
    )

    const bucket = result.state.nodesByWindow[9]!
    expect(bucket['f']?.kind).toBe('folder')
    expect(bucket['f']?.windowId).toBe(9)
    expect(bucket['a']?.parentId).toBe('f')
    expect(bucket['f']?.childIds).toEqual(['a'])
    expect(rootOrder(result.state, 9)).toEqual(['f'])
    expect(result.state.nodesByWindow[5]).toBeUndefined()
  })
})
