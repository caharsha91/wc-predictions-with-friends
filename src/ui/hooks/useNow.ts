import { useEffect, useState } from 'react'

import { getCurrentAppPathname, isDemoPath } from '../../lib/dataMode'
import { readDemoNowOverride } from '../lib/demoControls'
import { useRouteDataMode } from './useRouteDataMode'

type UseNowOptions = {
  tickMs?: number
}

function resolveNow(): Date {
  if (typeof window !== 'undefined' && isDemoPath(getCurrentAppPathname())) {
    const overrideIso = readDemoNowOverride()
    if (overrideIso) return new Date(overrideIso)
  }
  return new Date()
}

export function useNow(options: UseNowOptions = {}): Date {
  const { tickMs = 0 } = options
  const mode = useRouteDataMode()
  const [now, setNow] = useState<Date>(() => resolveNow())

  useEffect(() => {
    setNow(resolveNow())
    if (typeof window === 'undefined') return

    const isDemo = mode === 'demo'
    if (isDemo) {
      const sync = () => setNow(resolveNow())
      window.addEventListener('storage', sync)
      window.addEventListener('wc-demo-controls-changed', sync as EventListener)
      window.addEventListener('hashchange', sync)
      return () => {
        window.removeEventListener('storage', sync)
        window.removeEventListener('wc-demo-controls-changed', sync as EventListener)
        window.removeEventListener('hashchange', sync)
      }
    }

    if (!tickMs) return
    const id = window.setInterval(() => setNow(resolveNow()), tickMs)
    return () => window.clearInterval(id)
  }, [mode, tickMs])

  return now
}
