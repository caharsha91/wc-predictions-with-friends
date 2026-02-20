import type { DataMode } from '../../lib/dataMode'

export type LastRouteValidationResult =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unauthorized' }
  | { kind: 'valid'; route: string }

const GROUP_ID_PATTERN = /^[A-L]$/

function parseRoute(value: string): { pathname: string; search: string } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return null
  try {
    const parsed = new URL(trimmed, 'https://wc.local')
    return {
      pathname: parsed.pathname.replace(/\/+$/, '') || '/',
      search: parsed.search
    }
  } catch {
    return null
  }
}

function isAllowedPathForMode(pathname: string, mode: DataMode): boolean {
  if (mode === 'demo') {
    if (pathname === '/demo/match-picks') return true
    if (pathname === '/demo/knockout-bracket') return true
    if (pathname === '/demo/leaderboard') return true
    const parts = pathname.split('/').filter(Boolean)
    if (parts.length === 3 && parts[0] === 'demo' && parts[1] === 'group-stage') {
      return GROUP_ID_PATTERN.test(parts[2])
    }
    return false
  }

  if (pathname === '/match-picks') return true
  if (pathname === '/knockout-bracket') return true
  if (pathname === '/leaderboard') return true
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 2 && parts[0] === 'group-stage') {
    return GROUP_ID_PATTERN.test(parts[1])
  }
  return false
}

function isAllowedPathInAnyMode(pathname: string): boolean {
  return isAllowedPathForMode(pathname, 'default') || isAllowedPathForMode(pathname, 'demo')
}

export function resolvePersistableLastRoute(pathname: string, search: string, mode: DataMode): string | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  if (!isAllowedPathForMode(normalizedPath, mode)) return null
  return `${normalizedPath}${search || ''}`
}

export function validateLastRoute(lastRoute: string | null, mode: DataMode): LastRouteValidationResult {
  if (!lastRoute) return { kind: 'missing' }
  const parsed = parseRoute(lastRoute)
  if (!parsed) return { kind: 'invalid' }

  if (isAllowedPathForMode(parsed.pathname, mode)) {
    return { kind: 'valid', route: `${parsed.pathname}${parsed.search}` }
  }

  if (isAllowedPathInAnyMode(parsed.pathname)) {
    return { kind: 'unauthorized' }
  }

  return { kind: 'invalid' }
}
