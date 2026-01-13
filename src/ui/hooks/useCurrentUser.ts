import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { useAuthState } from './useAuthState'
import { useSimulationState } from './useSimulationState'
import type { Member } from '../../types/members'

type UserState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; user: Member | null }

type RefreshListener = () => void

const refreshListeners = new Set<RefreshListener>()
const MEMBER_CACHE_KEY = 'wc-member-cache'
const MEMBER_CACHE_TTL_MS = 30 * 60 * 1000

type MemberCache = {
  uid: string | null
  email: string | null
  user: Member | null
  isMember: boolean
  savedAt: number
}

let inMemoryCache: MemberCache | null = null
let inflightPromise: Promise<MemberCache | null> | null = null

function readCache(): MemberCache | null {
  if (inMemoryCache) return inMemoryCache
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(MEMBER_CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as MemberCache
    inMemoryCache = parsed
    return parsed
  } catch {
    return null
  }
}

function writeCache(payload: MemberCache) {
  inMemoryCache = payload
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify(payload))
}

function clearCache() {
  inMemoryCache = null
  inflightPromise = null
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(MEMBER_CACHE_KEY)
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
  const simulation = useSimulationState()

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
        if (simulation.enabled) {
          const simulated =
            simulation.users.find((user) => user.id === simulation.selectedUserId) ?? null
          if (!canceled) {
            setState({
              status: 'ready',
              user: simulated
                ? {
                    id: simulated.id,
                    name: simulated.name,
                    email: simulated.email,
                    isAdmin: true,
                    isMember: true
                  }
                : null
            })
          }
          return
        }
        if (hasFirebase) {
          if (authState.status === 'loading') return
          if (!authState.user) {
            clearCache()
            if (!canceled) setState({ status: 'ready', user: null })
            return
          }
          const user = authState.user
          const normalizedEmail = user.email?.toLowerCase() ?? null
          const cache = readCache()
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

          if (inflightPromise) {
            const payload = await inflightPromise
            if (!canceled && payload) setState({ status: 'ready', user: payload.user })
            return
          }

          inflightPromise = (async () => {
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
              writeCache(payload)
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
            writeCache(payload)
            return payload
          })()

          const payload = await inflightPromise
          inflightPromise = null
          if (!canceled && payload) {
            setState({ status: 'ready', user: payload.user })
          }
          return
        }

        const membersFile = await fetchMembers()
        if (canceled) return
        const fallbackUser = membersFile.members.find((member) => member.id === CURRENT_USER_ID) ?? null
        setState({ status: 'ready', user: fallbackUser })
      } catch {
        inflightPromise = null
        if (!canceled) setState({ status: 'error' })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [
    authState.status,
    authState.user,
    refreshIndex,
    simulation.enabled,
    simulation.selectedUserId,
    simulation.users
  ])

  if (state.status === 'ready') return state.user
  return null
}
