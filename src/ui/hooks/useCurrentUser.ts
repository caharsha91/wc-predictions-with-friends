import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { useAuthState } from './useAuthState'
import { useSimulationState } from './useSimulationState'
import type { Member } from '../../types/members'
import { doc, getDoc } from 'firebase/firestore'

type UserState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; user: Member | null }

type RefreshListener = () => void

const refreshListeners = new Set<RefreshListener>()

export function refreshCurrentUser() {
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
                    isAdmin: true
                  }
                : null
            })
          }
          return
        }
        if (hasFirebase) {
          if (authState.status === 'loading') return
          if (!authState.user) {
            if (!canceled) setState({ status: 'ready', user: null })
            return
          }
          const user = authState.user
          if (!firebaseDb) {
            if (!canceled) {
              setState({
                status: 'ready',
                user: {
                  id: user.uid,
                  name: user.displayName || user.email || 'User',
                  email: user.email || undefined
                }
              })
            }
            return
          }
          const memberRef = doc(firebaseDb, 'leagues', getLeagueId(), 'members', user.uid)
          const snapshot = await getDoc(memberRef)
          if (canceled) return
          if (snapshot.exists()) {
            const data = snapshot.data() as Member
            const fallbackName = data.name ?? user.displayName ?? user.email ?? 'User'
            const fallbackEmail = data.email ?? user.email ?? undefined
            setState({
              status: 'ready',
              user: {
                ...data,
                id: user.uid,
                name: fallbackName,
                email: fallbackEmail
              }
            })
            return
          }
          setState({
            status: 'ready',
            user: {
              id: user.uid,
              name: user.displayName || user.email || 'User',
              email: user.email || undefined
            }
          })
          return
        }

        const membersFile = await fetchMembers()
        if (canceled) return
        const fallbackUser = membersFile.members.find((member) => member.id === CURRENT_USER_ID) ?? null
        setState({ status: 'ready', user: fallbackUser })
      } catch {
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
