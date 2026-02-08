import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { getCurrentAppPathname, isDemoPath } from '../../lib/dataMode'
import { useAuthState } from './useAuthState'
import { readDemoViewerId } from '../lib/demoControls'

export function useViewerId() {
  const { user } = useAuthState()
  const [viewerId, setViewerId] = useState<string>(() => {
    if (typeof window !== 'undefined' && isDemoPath(getCurrentAppPathname())) {
      return readDemoViewerId() ?? user?.uid ?? CURRENT_USER_ID
    }
    return user?.uid ?? CURRENT_USER_ID
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      if (!isDemoPath(getCurrentAppPathname())) {
        setViewerId(user?.uid ?? CURRENT_USER_ID)
        return
      }
      setViewerId(readDemoViewerId() ?? user?.uid ?? CURRENT_USER_ID)
    }
    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('wc-demo-controls-changed', sync as EventListener)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('wc-demo-controls-changed', sync as EventListener)
      window.removeEventListener('hashchange', sync)
    }
  }, [user?.uid])

  return viewerId
}
