export type CompanionArea = 'home' | 'picks' | 'leaderboard'

export const COMPANION_ROUTE_CAPABILITIES: Record<string, CompanionArea> = {
  '/m': 'home',
  '/m/picks': 'picks',
  '/m/leaderboard': 'leaderboard'
}

export const companionFeatureFlags = {
  enabled: true,
  areas: {
    home: true,
    picks: true,
    leaderboard: true
  }
} as const

const DENIED_PREFIXES = ['/m/admin', '/m/demo', '/m/group-stage']
const DEPRECATED_ROUTES = new Set(['/m/matches', '/m/profile', '/m/predictions'])
const PICKS_FALLBACK_PREFIXES = ['/m/match-picks']
const PUBLIC_ROUTES = new Set(['/m/login', '/m/access-denied'])

function normalizePathname(pathname: string): string {
  const trimmed = String(pathname ?? '').trim()
  if (!trimmed) return '/m'

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  const [withoutQuery] = withoutHash.split('?')
  const [withoutFragment] = withoutQuery.split('#')
  const normalized = withoutFragment.trim()

  if (!normalized) return '/m'
  if (normalized.length > 1 && normalized.endsWith('/')) return normalized.replace(/\/+$/, '') || '/'
  return normalized
}

export function isCompanionPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return normalized === '/m' || normalized.startsWith('/m/')
}

export function resolveCompanionArea(pathname: string): CompanionArea | null {
  const normalized = normalizePathname(pathname)
  return COMPANION_ROUTE_CAPABILITIES[normalized] ?? null
}

export function isCompanionPublicPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return PUBLIC_ROUTES.has(normalized)
}

export function isCompanionAreaEnabled(pathname: string): boolean {
  const area = resolveCompanionArea(pathname)
  if (!area) return false
  return companionFeatureFlags.areas[area]
}

export function isAdminOrDemoPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return (
    normalized.startsWith('/admin') ||
    normalized.startsWith('/demo') ||
    normalized.startsWith('/m/admin') ||
    normalized.startsWith('/m/demo')
  )
}

export function isCompanionDeniedPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  if (!isCompanionPath(normalized)) return false
  if (DEPRECATED_ROUTES.has(normalized)) return true
  if (DENIED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return true
  if (PICKS_FALLBACK_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return true
  }
  if (normalized === '/m/knockout-bracket') return true
  return false
}

export function resolveCompanionFallbackPath(pathname: string): string {
  const normalized = normalizePathname(pathname)

  if (DEPRECATED_ROUTES.has(normalized)) return '/m'
  if (isAdminOrDemoPath(normalized)) return '/m'
  if (DENIED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return '/m'
  if (PICKS_FALLBACK_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return '/m/picks'
  if (normalized === '/m/knockout-bracket') return '/m'
  return '/m'
}

export function resolveCompanionSafePath(pathname: string): string {
  const normalized = normalizePathname(pathname)

  // Companion mode is self-contained: never allow links to leave /m routes.
  if (!isCompanionPath(normalized)) return '/m'

  if (isCompanionPublicPath(normalized)) return normalized

  if (isCompanionDeniedPath(normalized)) {
    return resolveCompanionFallbackPath(normalized)
  }

  if (!resolveCompanionArea(normalized)) {
    return '/m'
  }

  return normalized
}
