import { useEffect, useState } from 'react'

import { fetchMatches, fetchPicks } from '../../lib/data'
import { fetchUserPicksDoc, saveUserPicksDoc } from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import { getUserPicksFromFile, loadLocalPicks, saveLocalPicks } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useAuthState } from './useAuthState'
import { useViewerId } from './useViewerId'

type PicksLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[] }

export function usePicksData() {
  const authState = useAuthState()
  const userId = useViewerId()
  const [state, setState] = useState<PicksLoadState>({ status: 'loading' })
  const [picks, setPicks] = useState<Pick[]>(() => loadLocalPicks(userId))
  const firestoreEnabled = hasFirebase && authState.status === 'ready' && !!authState.user

  useEffect(() => {
    let canceled = false
    async function load() {
      if (hasFirebase && authState.status === 'loading') return
      setState({ status: 'loading' })
      try {
        const matchesFile = await fetchMatches()
        if (canceled) return

        let nextPicks: Pick[] | null = null
        if (firestoreEnabled) {
          const remote = await fetchUserPicksDoc(userId)
          if (remote !== null) {
            nextPicks = remote
            saveLocalPicks(userId, remote)
          }
        }

        if (nextPicks === null) {
          const stored = loadLocalPicks(userId)
          if (stored.length > 0) {
            nextPicks = stored
          } else {
            const picksFile = await fetchPicks()
            nextPicks = getUserPicksFromFile(picksFile, userId)
          }
          if (firestoreEnabled && nextPicks.length > 0) {
            try {
              await saveUserPicksDoc(userId, nextPicks)
            } catch {
              // Ignore Firestore write failures for local-only usage.
            }
          }
        }

        setPicks(nextPicks ?? [])
        if (nextPicks && nextPicks.length > 0) {
          saveLocalPicks(userId, nextPicks)
        }

        setState({ status: 'ready', matches: matchesFile.matches })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, userId])

  function updatePicks(nextPicks: Pick[]) {
    setPicks(nextPicks)
    saveLocalPicks(userId, nextPicks)
    if (firestoreEnabled) {
      void saveUserPicksDoc(userId, nextPicks).catch(() => {})
    }
  }

  return { state, picks, updatePicks }
}
