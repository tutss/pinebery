import type { PanelId, StoredState } from '../shared/types'
import { DEFAULT_PANEL_ID } from '../shared/types'
import { saveStoredState } from './persistence'
import { MSG_TREE_UPDATED } from '../shared/messages'

let currentState: StoredState | null = null

export function getActivePanel(windowId: number): PanelId {
  if (!currentState) return DEFAULT_PANEL_ID
  const stored = currentState.activePanelByWindow[windowId]
  if (stored) {
    const panels = currentState.panelsByWindow[windowId] ?? []
    if (panels.some((p) => p.id === stored)) return stored
  }
  const order = currentState.panelOrderByWindow[windowId] ?? []
  return order[0] ?? DEFAULT_PANEL_ID
}

let resolveReady: () => void
const ready: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve
})

export async function initializeState(
  loader: () => Promise<StoredState>,
): Promise<void> {
  currentState = await loader()
  resolveReady()
}

export async function getState(): Promise<StoredState> {
  await ready
  if (!currentState) {
    throw new Error('pinebery: state not initialized')
  }
  return currentState
}

export async function setState(next: StoredState): Promise<void> {
  await ready
  currentState = next
  await saveStoredState(next)
  broadcastTreeUpdated(next)
}

let mutationLock: Promise<unknown> = Promise.resolve()

export function withStateLock<T>(task: () => Promise<T>): Promise<T | undefined> {
  const result = mutationLock.then(() => task()).catch((error: unknown) => {
    console.warn('pinebery: withStateLock task failed', error)
    return undefined
  })
  mutationLock = result
  return result
}

function broadcastTreeUpdated(state: StoredState): void {
  chrome.runtime
    .sendMessage({ type: MSG_TREE_UPDATED, state })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Receiving end does not exist')) {
        console.warn('pinebery: broadcast failed', error)
      }
    })
}
