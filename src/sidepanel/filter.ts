import type { NodeId, RenderEntry, StoredState } from '../shared/types'

export interface FilteredEntry {
  entry: RenderEntry
  matches: boolean
}

export function filterRenderEntries(
  entries: RenderEntry[],
  state: StoredState,
  windowId: number,
  rawQuery: string,
): FilteredEntry[] {
  const query = rawQuery.trim().toLowerCase()
  if (query === '') {
    return entries.map((entry) => ({ entry, matches: true }))
  }

  const bucket = state.nodesByWindow[windowId] ?? {}
  const directMatch = new Set<NodeId>()

  for (const node of Object.values(bucket)) {
    if (
      node.title.toLowerCase().includes(query) ||
      (node.url?.toLowerCase().includes(query) ?? false) ||
      (node.customTitle?.toLowerCase().includes(query) ?? false)
    ) {
      directMatch.add(node.id)
    }
  }

  const shouldShow = new Set<NodeId>(directMatch)
  for (const id of directMatch) {
    let current = bucket[id]
    while (current && current.parentId) {
      if (shouldShow.has(current.parentId)) break
      shouldShow.add(current.parentId)
      current = bucket[current.parentId]
    }
  }

  const result: FilteredEntry[] = []
  for (const entry of entries) {
    if (shouldShow.has(entry.nodeId)) {
      result.push({ entry, matches: directMatch.has(entry.nodeId) })
    }
  }
  return result
}
