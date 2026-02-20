import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'

import { fetchMatches, fetchPicks } from '../../lib/data'
import { fetchUserPicksDoc, saveUserPicksDoc } from '../../lib/firestoreData'
import { firebaseAuth, firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import { getUserPicksFromFile, loadLocalPicks, saveLocalPicks } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useAuthState } from './useAuthState'
import { refreshCurrentUser, useCurrentUser } from './useCurrentUser'
import { useDemoScenarioState } from './useDemoScenarioState'
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
  const demoScenario = useDemoScenarioState()
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
  const isLiveMode = !isDemoMode && hasFirebase

  async function resolveCanonicalUserId(fallbackUserId: string): Promise<string> {
    if (!isLiveMode || !firebaseDb) return fallbackUserId
    const email = firebaseAuth?.currentUser?.email?.toLowerCase() ?? null
    if (!email) return fallbackUserId
    try {
      const snapshot = await getDoc(doc(firebaseDb, 'leagues', getLeagueId(), 'members', email))
      if (!snapshot.exists()) return fallbackUserId
      const data = snapshot.data() as { id?: unknown }
      const canonicalId = typeof data.id === 'string' ? data.id.trim() : ''
      return canonicalId || fallbackUserId
    } catch {
      return fallbackUserId
    }
  }

  useEffect(() => {
    let canceled = false
    async function load() {
      if (hasFirebase && authState.status === 'loading') return
      setState({ status: 'loading' })
      setPicks(isLiveMode ? [] : loadLocalPicks(userId, mode))
      try {
        const matchesFile = await fetchMatches({ mode })
        if (canceled) return

        let nextPicks: Pick[] = []
        if (firestoreEnabled) {
          const canonicalUserId = await resolveCanonicalUserId(userId)
          const remote = await fetchUserPicksDoc(canonicalUserId)
          nextPicks = remote ?? []
          // Keep local cache aligned with Firestore truth in live mode.
          saveLocalPicks(canonicalUserId, nextPicks, mode)
        } else if (!isLiveMode) {
          const stored = loadLocalPicks(userId, mode)
          if (stored.length > 0) {
            nextPicks = stored
          } else {
            const picksFile = await fetchPicks({ mode })
            nextPicks = getUserPicksFromFile(picksFile, userId)
          }
        }

        setPicks(nextPicks)
        if (!isLiveMode && nextPicks.length > 0) {
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
  }, [authState.status, demoScenario, firestoreEnabled, isLiveMode, mode, userId])

  function updatePicks(nextPicks: Pick[]) {
    setPicks(nextPicks)
    saveLocalPicks(userId, nextPicks, mode)
    setSaveStatus('idle')
  }

  async function savePicks(nextPicks?: Pick[]) {
    if (!firestoreEnabled) {
      if (isLiveMode) {
        setSaveStatus('error')
        throw new Error('Unable to save picks: Firestore write is not enabled for this user.')
      }
      return
    }
    const canonicalUserId = await resolveCanonicalUserId(userId)
    const payload = (nextPicks ?? picks).map((pick) => ({
      ...pick,
      userId: canonicalUserId
    }))
    setSaveStatus('saving')
    try {
      await saveUserPicksDoc(canonicalUserId, payload)
      if (canonicalUserId !== userId) {
        refreshCurrentUser()
      }
      setSaveStatus('saved')
    } catch (error) {
      console.error('savePicks failed', error)
      setSaveStatus('error')
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        refreshCurrentUser()
      }
      if (error instanceof Error) throw error
      throw new Error('Unable to save picks.')
    }
  }

  return { state, picks, updatePicks, savePicks, saveStatus, canSave: firestoreEnabled }
}
