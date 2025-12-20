import { useEffect, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMembers } from '../../lib/data'
import type { Member } from '../../types/members'

type UserState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; user: Member | null }

export function useCurrentUser() {
  const [state, setState] = useState<UserState>({ status: 'loading' })

  useEffect(() => {
    let canceled = false
    async function load() {
      try {
        const membersFile = await fetchMembers()
        if (canceled) return
        const user = membersFile.members.find((member) => member.id === CURRENT_USER_ID) ?? null
        setState({ status: 'ready', user })
      } catch {
        if (!canceled) setState({ status: 'error' })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  if (state.status === 'ready') return state.user
  return null
}
