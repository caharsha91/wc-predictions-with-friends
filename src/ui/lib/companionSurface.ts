export type AppSurface = 'web' | 'companion'

export type CompanionArea = 'home' | 'predictions' | 'leaderboard' | 'matches' | 'profile'

export type CompanionRole = 'member' | 'admin'

export type RouteCapability = {
  surface: AppSurface
  area: CompanionArea
  requiresMember: boolean
  allowsAdminTools: boolean
  allowsDemoTools: boolean
  roles: CompanionRole[]
}

export const COMPANION_ROUTE_CAPABILITIES: Record<
  '/m' | '/m/predictions' | '/m/leaderboard' | '/m/matches' | '/m/profile',
  RouteCapability
> = {
  '/m': {
    surface: 'companion',
    area: 'home',
    requiresMember: true,
    allowsAdminTools: false,
    allowsDemoTools: false,
    roles: ['member', 'admin']
  },
  '/m/predictions': {
    surface: 'companion',
    area: 'predictions',
    requiresMember: true,
    allowsAdminTools: false,
    allowsDemoTools: false,
    roles: ['member', 'admin']
  },
  '/m/leaderboard': {
    surface: 'companion',
    area: 'leaderboard',
    requiresMember: true,
    allowsAdminTools: false,
    allowsDemoTools: false,
    roles: ['member', 'admin']
  },
  '/m/matches': {
    surface: 'companion',
    area: 'matches',
    requiresMember: true,
    allowsAdminTools: false,
    allowsDemoTools: false,
    roles: ['member', 'admin']
  },
  '/m/profile': {
    surface: 'companion',
    area: 'profile',
    requiresMember: true,
    allowsAdminTools: false,
    allowsDemoTools: false,
    roles: ['member', 'admin']
  }
}

type CompanionFeatureFlags = {
  enabled: boolean
  areas: Record<CompanionArea, boolean>
}

function readEnvFlag(name: string, fallback: boolean): boolean {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
  const raw = env[name]
  if (raw === undefined) return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

export const companionFeatureFlags: CompanionFeatureFlags = {
  enabled: readEnvFlag('VITE_COMPANION_ENABLED', true),
  areas: {
    home: readEnvFlag('VITE_COMPANION_HOME_ENABLED', true),
    predictions: readEnvFlag('VITE_COMPANION_PREDICTIONS_ENABLED', true),
    leaderboard: readEnvFlag('VITE_COMPANION_LEADERBOARD_ENABLED', true),
    matches: readEnvFlag('VITE_COMPANION_MATCHES_ENABLED', true),
    profile: readEnvFlag('VITE_COMPANION_PROFILE_ENABLED', true)
  }
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim()
  if (!trimmed) return '/'
  if (!trimmed.startsWith('/')) return `/${trimmed}`
  return trimmed
}

export function isCompanionPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return normalized === '/m' || normalized.startsWith('/m/')
}

export function resolveCompanionArea(pathname: string): CompanionArea | null {
  const normalized = normalizePathname(pathname)
  if (normalized === '/m') return 'home'
  if (normalized === '/m/predictions' || normalized.startsWith('/m/predictions/')) return 'predictions'
  if (normalized === '/m/leaderboard' || normalized.startsWith('/m/leaderboard/')) return 'leaderboard'
  if (normalized === '/m/matches' || normalized.startsWith('/m/matches/')) return 'matches'
  if (normalized === '/m/profile' || normalized.startsWith('/m/profile/')) return 'profile'
  return null
}

export function isCompanionAreaEnabled(pathname: string): boolean {
  const area = resolveCompanionArea(pathname)
  if (!area) return true
  return companionFeatureFlags.areas[area]
}

export function isCompanionDeniedPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return (
    normalized === '/m/admin' ||
    normalized.startsWith('/m/admin/') ||
    normalized === '/m/demo' ||
    normalized.startsWith('/m/demo/') ||
    normalized === '/m/group-stage' ||
    normalized.startsWith('/m/group-stage/') ||
    normalized === '/m/match-picks' ||
    normalized.startsWith('/m/match-picks/') ||
    normalized === '/m/knockout-bracket' ||
    normalized.startsWith('/m/knockout-bracket/')
  )
}

export function resolveCompanionFallbackPath(pathname: string): '/m' | '/m/predictions' | '/m/profile' {
  const normalized = normalizePathname(pathname)
  if (
    normalized === '/m/admin' ||
    normalized.startsWith('/m/admin/') ||
    normalized === '/m/demo' ||
    normalized.startsWith('/m/demo/')
  ) {
    return '/m/profile'
  }
  if (
    normalized === '/m/group-stage' ||
    normalized.startsWith('/m/group-stage/') ||
    normalized === '/m/match-picks' ||
    normalized.startsWith('/m/match-picks/') ||
    normalized === '/m/knockout-bracket' ||
    normalized.startsWith('/m/knockout-bracket/')
  ) {
    return '/m/predictions'
  }
  return '/m'
}
