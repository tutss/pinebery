import { describe, it, expect } from 'vitest'
import { filterRenderEntries } from '../../src/sidepanel/filter'
import {
  createEmptyState,
  DEFAULT_PANEL_ID,
  type NodeId,
  type StoredState,
  type TreeNode,
} from '../../src/shared/types'
import { flattenForRender } from '../../src/background/tree-ops'

const DEFAULT_WINDOW_ID = 1

function makeNode(
  id: NodeId,
  title: string,
  url: string,
  overrides: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    tabId: parseInt(id.replace(/\D/g, ''), 10) || 1,
    windowId: DEFAULT_WINDOW_ID,
    url,
    title,
    parentId: null,
    childIds: [],
    collapsed: false,
    pinned: false,
    panelId: DEFAULT_PANEL_ID,
    ...overrides,
  }
}

function buildState(): StoredState {
  const state = createEmptyState()
  const root = makeNode('root', 'Programming resources', 'https://prog.example', {
    childIds: ['react', 'svelte'],
  })
  const react = makeNode('react', 'React docs', 'https://react.dev', {
    parentId: 'root',
    childIds: ['hooks'],
  })
  const hooks = makeNode('hooks', 'React hooks guide', 'https://react.dev/hooks', {
    parentId: 'react',
  })
  const svelte = makeNode('svelte', 'Svelte kit', 'https://kit.svelte.dev', {
    parentId: 'root',
  })
  const unrelated = makeNode('news', 'Daily news', 'https://news.example')

  const bucket: Record<NodeId, TreeNode> = { root, react, hooks, svelte, news: unrelated }
  state.nodesByWindow[DEFAULT_WINDOW_ID] = bucket
  state.rootOrderByWindow[DEFAULT_WINDOW_ID] = { [DEFAULT_PANEL_ID]: ['root', 'news'] }
  return state
}

describe('filterRenderEntries', () => {
  it('returns all entries as matches when query is empty', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, '')
    expect(filtered.length).toBe(entries.length)
    expect(filtered.every((f) => f.matches)).toBe(true)
  })

  it('returns all entries as matches when query is whitespace', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, '   ')
    expect(filtered.length).toBe(entries.length)
  })

  it('matches by title substring', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'hooks')
    const matched = filtered.filter((f) => f.matches).map((f) => f.entry.nodeId)
    expect(matched).toEqual(['hooks'])
  })

  it('matches by URL substring', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'svelte.dev')
    const matched = filtered.filter((f) => f.matches).map((f) => f.entry.nodeId)
    expect(matched).toEqual(['svelte'])
  })

  it('includes non-matching ancestors as dimmed context', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'hooks guide')
    const ids = filtered.map((f) => f.entry.nodeId)
    expect(ids).toEqual(['root', 'react', 'hooks'])
    expect(filtered.find((f) => f.entry.nodeId === 'root')!.matches).toBe(false)
    expect(filtered.find((f) => f.entry.nodeId === 'react')!.matches).toBe(false)
    expect(filtered.find((f) => f.entry.nodeId === 'hooks')!.matches).toBe(true)
  })

  it('returns empty list when nothing matches', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'nonexistent')
    expect(filtered).toEqual([])
  })

  it('is case-insensitive', () => {
    const state = buildState()
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'REACT DOCS')
    const matched = filtered.filter((f) => f.matches).map((f) => f.entry.nodeId)
    expect(matched).toEqual(['react'])
  })

  it('matches by customTitle substring', () => {
    const state = buildState()
    const bucket = state.nodesByWindow[DEFAULT_WINDOW_ID]!
    bucket['news']!.customTitle = 'Morning briefing'
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const filtered = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'morning')
    const matched = filtered.filter((f) => f.matches).map((f) => f.entry.nodeId)
    expect(matched).toEqual(['news'])
  })

  it('matches by either customTitle or original title', () => {
    const state = buildState()
    const bucket = state.nodesByWindow[DEFAULT_WINDOW_ID]!
    bucket['react']!.customTitle = 'Frontend stack'
    const entries = flattenForRender(state, DEFAULT_WINDOW_ID, DEFAULT_PANEL_ID)
    const matchedByCustom = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'frontend')
      .filter((f) => f.matches)
      .map((f) => f.entry.nodeId)
    const matchedByOriginal = filterRenderEntries(entries, state, DEFAULT_WINDOW_ID, 'react docs')
      .filter((f) => f.matches)
      .map((f) => f.entry.nodeId)
    expect(matchedByCustom).toEqual(['react'])
    expect(matchedByOriginal).toEqual(['react'])
  })
})
