import { useEffect, useState } from 'react'

import { getCurrentAppPathname, isDemoPath, type DataMode } from '../../lib/dataMode'

export function useRouteDataMode(): DataMode {
  const [pathname, setPathname] = useState<string>(() => getCurrentAppPathname())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => setPathname(getCurrentAppPathname())
    const syncAfterNavigation = () => {
      sync()
      window.setTimeout(sync, 0)
      window.requestAnimationFrame(sync)
    }
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    window.addEventListener('wc-demo-controls-changed', syncAfterNavigation as EventListener)
    window.addEventListener('wc-demo-scenario-changed', syncAfterNavigation as EventListener)
    return () => {
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('popstate', sync)
      window.removeEventListener('wc-demo-controls-changed', syncAfterNavigation as EventListener)
      window.removeEventListener('wc-demo-scenario-changed', syncAfterNavigation as EventListener)
    }
  }, [])

  return isDemoPath(pathname) ? 'demo' : 'default'
}

export function useIsDemoRoute(): boolean {
  return useRouteDataMode() === 'demo'
}
