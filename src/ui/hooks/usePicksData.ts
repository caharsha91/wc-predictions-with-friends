import { useEffect, useState } from 'react'

import { fetchMatches, fetchPicks } from '../../lib/data'
import { fetchUserPicksDoc, saveUserPicksDoc } from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import { getUserPicksFromFile, loadLocalPicks, saveLocalPicks } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useAuthState } from './useAuthState'
import { useCurrentUser } from './useCurrentUser'
import { useRouteDataMode } from './useRouteDataMode'
import { useViewerId } from './useViewerId'

type PicksLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; lastUpdated: string }

export function usePicksData() {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'
  const userId = useViewerId()
  const [state, setState] = useState<PicksLoadState>({ status: 'loading' })
  const [picks, setPicks] = useState<Pick[]>(() => loadLocalPicks(userId, mode))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const firestoreEnabled =
    !isDemoMode &&
    hasFirebase &&
    authState.status === 'ready' &&
    !!authState.user &&
    currentUser?.isMember === true

  useEffect(() => {
    let canceled = false
    async function load() {
      if (hasFirebase && authState.status === 'loading') return
      setState({ status: 'loading' })
      try {
        const matchesFile = await fetchMatches({ mode })
        if (canceled) return

        let nextPicks: Pick[] | null = null
        if (firestoreEnabled) {
          const remote = await fetchUserPicksDoc(userId)
          if (remote !== null) {
            nextPicks = remote
            saveLocalPicks(userId, remote, mode)
          }
        }

        if (nextPicks === null) {
          const stored = loadLocalPicks(userId, mode)
          if (stored.length > 0) {
            nextPicks = stored
          } else {
            const picksFile = await fetchPicks({ mode })
            nextPicks = getUserPicksFromFile(picksFile, userId)
          }
        }

        setPicks(nextPicks ?? [])
        if (nextPicks && nextPicks.length > 0) {
          saveLocalPicks(userId, nextPicks, mode)
        }
        setSaveStatus('idle')
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          lastUpdated: matchesFile.lastUpdated
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, mode, userId])

  function updatePicks(nextPicks: Pick[]) {
    setPicks(nextPicks)
    saveLocalPicks(userId, nextPicks, mode)
    setSaveStatus('idle')
  }

  async function savePicks(nextPicks?: Pick[]) {
    if (!firestoreEnabled) return
    const payload = nextPicks ?? picks
    setSaveStatus('saving')
    try {
      await saveUserPicksDoc(userId, payload)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  return { state, picks, updatePicks, savePicks, saveStatus, canSave: firestoreEnabled }
}
