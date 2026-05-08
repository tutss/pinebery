const pendingOwnMoves = new Map<number, number>()

export function markOwnMove(tabId: number): void {
  const count = pendingOwnMoves.get(tabId) ?? 0
  pendingOwnMoves.set(tabId, count + 1)
}

export function consumeOwnMove(tabId: number): boolean {
  const count = pendingOwnMoves.get(tabId) ?? 0
  if (count > 0) {
    if (count === 1) {
      pendingOwnMoves.delete(tabId)
    } else {
      pendingOwnMoves.set(tabId, count - 1)
    }
    return true
  }
  return false
}
