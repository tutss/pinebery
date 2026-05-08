import type { GroupColor } from '../shared/types'

export const GROUP_COLOR_MAP: Record<GroupColor, string> = {
  grey: '#9aa0a6',
  blue: '#4285f4',
  red: '#ea4335',
  yellow: '#fbbc04',
  green: '#34a853',
  pink: '#f06292',
  purple: '#ab47bc',
  cyan: '#26c6da',
  orange: '#fb8c00',
}

export function resolveGroupColor(color: GroupColor | undefined): string | null {
  if (!color) return null
  return GROUP_COLOR_MAP[color] ?? null
}
