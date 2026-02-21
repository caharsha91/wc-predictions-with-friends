import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import { getCurrentAppPathname, isDemoPath } from '../../lib/dataMode'
import { readDemoViewerId, writeDemoViewerId } from '../lib/demoControls'
import { useCurrentUser } from './useCurrentUser'

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

async function resolveDemoViewerId({
  currentMemberId,
  storedViewerId
}: {
  currentMemberId: string
  storedViewerId: string | null
}): Promise<{ resolvedViewerId: string; shouldPersistResolved: boolean }> {
  const stored = storedViewerId?.trim() ?? ''
  if (!stored) {
    return {
      resolvedViewerId: currentMemberId,
      shouldPersistResolved: false
    }
  }

  const storedKey = normalizeKey(stored)

  try {
    const membersFile = await fetchMembers({ mode: 'demo' })
    const members = membersFile.members ?? []
    if (members.length === 0) {
      return {
        resolvedViewerId: currentMemberId,
        shouldPersistResolved: false
      }
    }

    const exactIdMatch = members.find((member) => member.id === stored)
    if (exactIdMatch) {
      return {
        resolvedViewerId: exactIdMatch.id,
        shouldPersistResolved: false
      }
    }

    const caseInsensitiveIdMatch = members.find((member) => normalizeKey(member.id) === storedKey)
    if (caseInsensitiveIdMatch) {
      return {
        resolvedViewerId: caseInsensitiveIdMatch.id,
        shouldPersistResolved: caseInsensitiveIdMatch.id !== stored
      }
    }

    const nameMatch = members.find((member) => normalizeKey(member.name) === storedKey)
    if (nameMatch) {
      return {
        resolvedViewerId: nameMatch.id,
        shouldPersistResolved: true
      }
    }

    const defaultIdKey = normalizeKey(currentMemberId)
    const defaultExact = members.find((member) => member.id === currentMemberId)
    if (defaultExact) {
      return {
        resolvedViewerId: defaultExact.id,
        shouldPersistResolved: defaultExact.id !== stored
      }
    }

    const defaultCaseInsensitive = members.find((member) => normalizeKey(member.id) === defaultIdKey)
    if (defaultCaseInsensitive) {
      return {
        resolvedViewerId: defaultCaseInsensitive.id,
        shouldPersistResolved: defaultCaseInsensitive.id !== stored
      }
    }

    const fallbackMemberId = members[0]?.id ?? currentMemberId
    return {
      resolvedViewerId: fallbackMemberId,
      shouldPersistResolved: fallbackMemberId !== stored
    }
  } catch {
    return {
      resolvedViewerId: currentMemberId,
      shouldPersistResolved: false
    }
  }
}

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
    let canceled = false
    let syncVersion = 0

    const sync = () => {
      const version = syncVersion + 1
      syncVersion = version
      const currentMemberId = user?.id ?? CURRENT_USER_ID
      if (!isDemoPath(getCurrentAppPathname())) {
        setViewerId(currentMemberId)
        return
      }

      const storedViewerId = readDemoViewerId()
      void (async () => {
        const { resolvedViewerId, shouldPersistResolved } = await resolveDemoViewerId({
          currentMemberId,
          storedViewerId
        })
        if (canceled || version !== syncVersion) return
        setViewerId(resolvedViewerId)

        if (!shouldPersistResolved) return
        if (normalizeKey(storedViewerId) === normalizeKey(resolvedViewerId)) return

        writeDemoViewerId(resolvedViewerId)
        window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
      })()
    }

    sync()
    window.addEventListener('storage', sync)
    window.addEventListener('wc-demo-controls-changed', sync as EventListener)
    window.addEventListener('hashchange', sync)
    return () => {
      canceled = true
      window.removeEventListener('storage', sync)
      window.removeEventListener('wc-demo-controls-changed', sync as EventListener)
      window.removeEventListener('hashchange', sync)
    }
  }, [user?.id])

  return viewerId
}
