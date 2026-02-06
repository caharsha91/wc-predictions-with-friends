import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'

import { firebaseAuth, hasFirebase } from '../../lib/firebase'

type AuthStatus = 'loading' | 'ready' | 'disabled'

type AuthState = {
  status: AuthStatus
  user: User | null
}

export function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: hasFirebase ? 'loading' : 'disabled',
    user: null
  })

  useEffect(() => {
    if (!firebaseAuth) {
      setState({ status: 'disabled', user: null })
      return
    }
    setState({ status: 'loading', user: null })
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      setState({ status: 'ready', user })
    })
    return () => unsubscribe()
  }, [])

  return state
}
