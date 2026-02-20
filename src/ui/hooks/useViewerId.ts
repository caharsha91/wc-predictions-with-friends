import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { getCurrentAppPathname, isDemoPath } from '../../lib/dataMode'
import { readDemoViewerId } from '../lib/demoControls'
import { useCurrentUser } from './useCurrentUser'

export function useViewerId() {
  const user = useCurrentUser()
  const [viewerId, setViewerId] = useState<string>(() => {
    const currentMemberId = user?.id ?? CURRENT_USER_ID
    if (typeof window !== 'undefined' && isDemoPath(getCurrentAppPathname())) {
      return readDemoViewerId() ?? currentMemberId
    }
    return currentMemberId
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      const currentMemberId = user?.id ?? CURRENT_USER_ID
      if (!isDemoPath(getCurrentAppPathname())) {
        setViewerId(currentMemberId)
        return
      }
      setViewerId(readDemoViewerId() ?? currentMemberId)
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
  }, [user?.id])

  return viewerId
}
