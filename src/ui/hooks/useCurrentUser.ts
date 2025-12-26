import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { useAuthState } from './useAuthState'
import type { Member } from '../../types/members'
import { doc, getDoc } from 'firebase/firestore'

type UserState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; user: Member | null }

export function useCurrentUser() {
  const [state, setState] = useState<UserState>({ status: 'loading' })
  const authState = useAuthState()

  useEffect(() => {
    let canceled = false
    async function load() {
      try {
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
            setState({ status: 'ready', user: { ...data, id: user.uid } })
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
  }, [authState.status, authState.user])

  if (state.status === 'ready') return state.user
  return null
}
