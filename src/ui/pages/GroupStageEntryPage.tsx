import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DataMode } from '../../lib/dataMode'
import Skeleton from '../components/ui/Skeleton'
import V2Card from '../components/v2/V2Card'
import { useAuthState } from '../hooks/useAuthState'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { validateLastRoute } from '../lib/lastRoute'
import { readUserProfile } from '../lib/profilePersistence'

const GROUP_ID_PATTERN = /^[A-L]$/

function fallbackGroupRoute(mode: DataMode): string {
  return mode === 'demo' ? '/demo/group-stage/A' : '/group-stage/A'
}

function extractGroupRoute(route: string, mode: DataMode): string | null {
  try {
    const parsed = new URL(route, 'https://wc.local')
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (mode === 'demo') {
      if (parts.length === 3 && parts[0] === 'demo' && parts[1] === 'group-stage' && GROUP_ID_PATTERN.test(parts[2])) {
        return `${parsed.pathname}${parsed.search}`
      }
      return null
    }
    if (parts.length === 2 && parts[0] === 'group-stage' && GROUP_ID_PATTERN.test(parts[1])) {
      return `${parsed.pathname}${parsed.search}`
    }
    return null
  } catch {
    return null
  }
}

export default function GroupStageEntryPage() {
  const navigate = useNavigate()
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const authState = useAuthState()

  useEffect(() => {
    let canceled = false

    async function resolveEntryRoute() {
      const fallbackRoute = fallbackGroupRoute(mode)
      try {
        const profile = await readUserProfile(mode, viewerId, authState.user?.email ?? null)
        if (canceled) return
        const validation = validateLastRoute(profile.lastRoute, mode)
        if (validation.kind === 'valid') {
          const groupRoute = extractGroupRoute(validation.route, mode)
          if (groupRoute) {
            navigate(groupRoute, { replace: true })
            return
          }
        }
      } catch {
        // Best effort route read; fallback below.
      }
      if (!canceled) navigate(fallbackRoute, { replace: true })
    }

    void resolveEntryRoute()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, mode, navigate, viewerId])

  return (
    <V2Card className="space-y-3 p-3">
      <Skeleton className="h-14 rounded-xl" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </V2Card>
  )
}
