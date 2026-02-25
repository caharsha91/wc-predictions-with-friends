export const DEMO_LAST_ROUTE_STORAGE_KEY = 'demo:lastRoute'
export const DEMO_RIVAL_USER_IDS_STORAGE_KEY = 'demo:rivalUserIds'
export const DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY = 'demo:favoriteTeamCodeByViewer'

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
  const parseRivalIds = (raw: string | null): string[] => {
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

  const sessionValue = parseRivalIds(window.sessionStorage.getItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY))
  if (sessionValue.length > 0) return sessionValue

  const localValue = parseRivalIds(window.localStorage.getItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY))
  if (localValue.length > 0) {
    window.sessionStorage.setItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY, JSON.stringify(localValue))
  }
  return localValue
}

export function writeDemoRivalUserIds(userIds: string[]): void {
  if (typeof window === 'undefined') return
  const normalized = userIds
    .map((value) => value.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
  const serialized = JSON.stringify(normalized)
  window.localStorage.setItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY, serialized)
  window.sessionStorage.setItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY, serialized)
}

export function clearDemoRivalUserIds(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY)
  window.sessionStorage.removeItem(DEMO_RIVAL_USER_IDS_STORAGE_KEY)
}

type DemoFavoriteTeamMap = Record<string, string | null>

function normalizeViewerKey(memberId: string): string {
  return memberId.trim().toLowerCase()
}

function parseFavoriteTeamMap(raw: string | null): DemoFavoriteTeamMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: DemoFavoriteTeamMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = key.trim().toLowerCase()
      if (!normalizedKey) continue
      if (value === null) {
        next[normalizedKey] = null
        continue
      }
      if (typeof value !== 'string') continue
      const normalizedValue = value.trim().toUpperCase()
      if (!normalizedValue) continue
      next[normalizedKey] = normalizedValue
    }
    return next
  } catch {
    return {}
  }
}

function readFavoriteTeamMap(): DemoFavoriteTeamMap {
  if (typeof window === 'undefined') return {}
  return parseFavoriteTeamMap(window.localStorage.getItem(DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY))
}

function writeFavoriteTeamMap(map: DemoFavoriteTeamMap): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY, JSON.stringify(map))
}

export function readDemoFavoriteTeamCode(memberId: string): string | null {
  if (typeof window === 'undefined') return null
  const key = normalizeViewerKey(memberId)
  if (!key) return null
  const map = readFavoriteTeamMap()
  const value = map[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function writeDemoFavoriteTeamCode(memberId: string, favoriteTeamCode: string | null): void {
  if (typeof window === 'undefined') return
  const key = normalizeViewerKey(memberId)
  if (!key) return
  const map = readFavoriteTeamMap()
  map[key] = favoriteTeamCode
  writeFavoriteTeamMap(map)
}
