import { useEffect, useState } from 'react'

import { getCurrentAppPathname, isDemoPath, type DataMode } from '../../lib/dataMode'

export function useRouteDataMode(): DataMode {
  const [pathname, setPathname] = useState<string>(() => getCurrentAppPathname())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setPathname(getCurrentAppPathname())
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
    }
  }, [])

  return isDemoPath(pathname) ? 'demo' : 'default'
}

export function useIsDemoRoute(): boolean {
  return useRouteDataMode() === 'demo'
}
