export type DataMode = 'default' | 'demo'

export function isDemoPath(pathname: string): boolean {
  return pathname === '/demo' || pathname.startsWith('/demo/')
}

export function getCurrentAppPathname(): string {
  if (typeof window === 'undefined') return '/'
  const hash = window.location.hash
  if (hash.startsWith('#/')) {
    const path = hash.slice(1)
    return path || '/'
  }
  return window.location.pathname || '/'
}
