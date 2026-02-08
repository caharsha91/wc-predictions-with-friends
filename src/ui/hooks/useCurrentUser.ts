import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import type { DataMode } from '../../lib/dataMode'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { useAuthState } from './useAuthState'
import { useRouteDataMode } from './useRouteDataMode'
import type { Member } from '../../types/members'

type UserState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; user: Member | null }

type RefreshListener = () => void

const refreshListeners = new Set<RefreshListener>()
const MEMBER_CACHE_TTL_MS = 30 * 60 * 1000

type MemberCache = {
  uid: string | null
  email: string | null
  user: Member | null
  isMember: boolean
  savedAt: number
}

const inMemoryCache = new Map<string, MemberCache>()
const inflightPromises = new Map<string, Promise<MemberCache | null>>()

function getMemberCacheKey(mode: DataMode): string {
  return `wc-member-cache:${mode}`
}

function readCache(cacheKey: string): MemberCache | null {
  const memory = inMemoryCache.get(cacheKey)
  if (memory) return memory
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(cacheKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MemberCache
    inMemoryCache.set(cacheKey, parsed)
    return parsed
  } catch {
    return null
  }
}

function writeCache(cacheKey: string, payload: MemberCache) {
  inMemoryCache.set(cacheKey, payload)
  if (typeof window === 'undefined') return
  window.localStorage.setItem(cacheKey, JSON.stringify(payload))
}

function clearCache(cacheKey?: string) {
  if (cacheKey) {
    inMemoryCache.delete(cacheKey)
    inflightPromises.delete(cacheKey)
  } else {
    inMemoryCache.clear()
    inflightPromises.clear()
  }
  if (typeof window === 'undefined') return
  if (cacheKey) {
    window.localStorage.removeItem(cacheKey)
    return
  }
  const keysToRemove: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith('wc-member-cache:')) continue
    keysToRemove.push(key)
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }
}

function isCacheValid(cache: MemberCache | null, uid: string | null, email: string | null) {
  if (!cache) return false
  if (cache.uid !== uid) return false
  if (cache.email !== email) return false
  return Date.now() - cache.savedAt < MEMBER_CACHE_TTL_MS
}

export function refreshCurrentUser() {
  clearCache()
  refreshListeners.forEach((listener) => listener())
}

export function useCurrentUser() {
  const [state, setState] = useState<UserState>({ status: 'loading' })
  const [refreshIndex, setRefreshIndex] = useState(0)
  const authState = useAuthState()
  const mode = useRouteDataMode()
  const cacheKey = getMemberCacheKey(mode)

  useEffect(() => {
    const handleRefresh = () => {
      setRefreshIndex((current) => current + 1)
    }
    refreshListeners.add(handleRefresh)
    return () => {
      refreshListeners.delete(handleRefresh)
    }
  }, [])

  useEffect(() => {
    let canceled = false
    async function load() {
      try {
        if (hasFirebase) {
          if (authState.status === 'loading') return
          if (!authState.user) {
            clearCache(cacheKey)
            if (!canceled) setState({ status: 'ready', user: null })
            return
          }
          const user = authState.user
          const normalizedEmail = user.email?.toLowerCase() ?? null
          const cache = readCache(cacheKey)
          if (isCacheValid(cache, user.uid, normalizedEmail)) {
            if (!canceled) setState({ status: 'ready', user: cache?.user ?? null })
            return
          }
          if (!firebaseDb) {
            if (!canceled) {
              setState({
                status: 'ready',
                user: {
                  id: user.uid,
                  name: user.displayName || user.email || 'User',
                  email: user.email || undefined,
                  isMember: false
                }
              })
            }
            return
          }

          const inflight = inflightPromises.get(cacheKey)
          if (inflight) {
            const payload = await inflight
            if (!canceled && payload) setState({ status: 'ready', user: payload.user })
            return
          }

          const promise = (async () => {
            const leagueId = getLeagueId()
            if (!normalizedEmail) {
              const fallbackUser: Member = {
                id: user.uid,
                name: user.displayName || user.email || 'User',
                email: user.email || undefined,
                isAdmin: false,
                isMember: false
              }
              const payload: MemberCache = {
                uid: user.uid,
                email: normalizedEmail,
                user: fallbackUser,
                isMember: false,
                savedAt: Date.now()
              }
              writeCache(cacheKey, payload)
              return payload
            }
            const memberRef = doc(firebaseDb, 'leagues', leagueId, 'members', normalizedEmail)
            const memberSnap = await getDoc(memberRef)
            const memberData = memberSnap.exists() ? (memberSnap.data() as Member) : null
            const memberIsAdmin = memberData?.isAdmin === true
            const isMember = memberSnap.exists()
            const fallbackName = memberData?.name ?? user.displayName ?? user.email ?? 'User'
            const fallbackEmail = memberData?.email ?? user.email ?? undefined
            const resolvedUser: Member = {
              ...(memberData ?? {}),
              id: user.uid,
              name: fallbackName,
              email: fallbackEmail,
              isAdmin: memberIsAdmin,
              isMember
            }
            const payload: MemberCache = {
              uid: user.uid,
              email: normalizedEmail,
              user: resolvedUser,
              isMember,
              savedAt: Date.now()
            }
            writeCache(cacheKey, payload)
            return payload
          })()
          inflightPromises.set(cacheKey, promise)

          const payload = await promise
          inflightPromises.delete(cacheKey)
          if (!canceled && payload) {
            setState({ status: 'ready', user: payload.user })
          }
          return
        }

        const membersFile = await fetchMembers({ mode })
        if (canceled) return
        const fallbackUser = membersFile.members.find((member) => member.id === CURRENT_USER_ID) ?? null
        setState({ status: 'ready', user: fallbackUser })
      } catch {
        inflightPromises.delete(cacheKey)
        if (!canceled) setState({ status: 'error' })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, authState.user, cacheKey, mode, refreshIndex])

  if (state.status === 'ready') return state.user
  return null
}
