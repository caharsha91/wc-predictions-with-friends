export const DEMO_LAST_ROUTE_STORAGE_KEY = 'demo:lastRoute'
export const DEMO_RIVAL_USER_IDS_STORAGE_KEY = 'demo:rivalUserIds'

function readString(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function readDemoLastRoute(): string | null {
  if (typeof window === 'undefined') return null
  return readString(window.localStorage.getItem(DEMO_LAST_ROUTE_STORAGE_KEY))
}

export function writeDemoLastRoute(route: string): void {
  if (typeof window === 'undefined') return
  const normalized = readString(route)
  if (!normalized) {
    window.localStorage.removeItem(DEMO_LAST_ROUTE_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(DEMO_LAST_ROUTE_STORAGE_KEY, normalized)
}

export function clearDemoLastRoute(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_LAST_ROUTE_STORAGE_KEY)
}

export function readDemoRivalUserIds(): string[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => Boolean(value))
      .slice(0, 3)
  } catch {
    return []
  }
}

export function writeDemoRivalUserIds(userIds: string[]): void {
  if (typeof window === 'undefined') return
  const normalized = userIds
    .map((value) => value.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
  window.localStorage.setItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY, JSON.stringify(normalized))
}

export function clearDemoRivalUserIds(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY)
}
