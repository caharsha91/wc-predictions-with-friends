import {
  getParsedStorage,
  getStoredString,
  removeStoredKey,
  setSerializedStorage,
  setStoredString
} from '../../lib/storage'

export const DEMO_LAST_ROUTE_STORAGE_KEY = 'demo:lastRoute'
export const DEMO_RIVAL_USER_IDS_STORAGE_KEY = 'demo:rivalUserIds'
export const DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY = 'demo:favoriteTeamCodeByViewer'

function readString(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function readDemoLastRoute(): string | null {
  return readString(getStoredString(DEMO_LAST_ROUTE_STORAGE_KEY))
}

export function writeDemoLastRoute(route: string): void {
  const normalized = readString(route)
  if (!normalized) {
    removeStoredKey(DEMO_LAST_ROUTE_STORAGE_KEY)
    return
  }
  setStoredString(DEMO_LAST_ROUTE_STORAGE_KEY, normalized)
}

export function clearDemoLastRoute(): void {
  removeStoredKey(DEMO_LAST_ROUTE_STORAGE_KEY)
}

export function readDemoRivalUserIds(): string[] {
  const parseRivalIds = (raw: string): string[] | null => {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => Boolean(value))
        .slice(0, 3)
    } catch {
      return null
    }
  }

  const sessionValue = getParsedStorage(DEMO_RIVAL_USER_IDS_STORAGE_KEY, parseRivalIds, { area: 'session' }) ?? []
  if (sessionValue.length > 0) return sessionValue

  const localValue = getParsedStorage(DEMO_RIVAL_USER_IDS_STORAGE_KEY, parseRivalIds) ?? []
  if (localValue.length > 0) {
    setSerializedStorage(DEMO_RIVAL_USER_IDS_STORAGE_KEY, localValue, JSON.stringify, { area: 'session' })
  }
  return localValue
}

export function writeDemoRivalUserIds(userIds: string[]): void {
  const normalized = userIds
    .map((value) => value.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
  setSerializedStorage(DEMO_RIVAL_USER_IDS_STORAGE_KEY, normalized)
  setSerializedStorage(DEMO_RIVAL_USER_IDS_STORAGE_KEY, normalized, JSON.stringify, { area: 'session' })
}

export function clearDemoRivalUserIds(): void {
  removeStoredKey(DEMO_RIVAL_USER_IDS_STORAGE_KEY)
  removeStoredKey(DEMO_RIVAL_USER_IDS_STORAGE_KEY, { area: 'session' })
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
  return getParsedStorage(DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY, parseFavoriteTeamMap) ?? {}
}

function writeFavoriteTeamMap(map: DemoFavoriteTeamMap): void {
  setSerializedStorage(DEMO_FAVORITE_TEAM_CODE_STORAGE_KEY, map)
}

export function readDemoFavoriteTeamCode(memberId: string): string | null {
  const key = normalizeViewerKey(memberId)
  if (!key) return null
  const map = readFavoriteTeamMap()
  const value = map[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export function writeDemoFavoriteTeamCode(memberId: string, favoriteTeamCode: string | null): void {
  const key = normalizeViewerKey(memberId)
  if (!key) return
  const map = readFavoriteTeamMap()
  map[key] = favoriteTeamCode
  writeFavoriteTeamMap(map)
}
