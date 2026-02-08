import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  combineBracketPredictions,
  loadLocalBracketPrediction,
  saveLocalBracketPrediction
} from '../../lib/bracket'
import { fetchBracketPredictions, fetchMatches } from '../../lib/data'
import {
  fetchUserBracketKnockoutDoc,
  saveUserBracketKnockoutDoc
} from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import type { Match, MatchWinner } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { useAuthState } from './useAuthState'
import { useCurrentUser } from './useCurrentUser'
import { useRouteDataMode } from './useRouteDataMode'
import { useViewerId } from './useViewerId'

export const KNOCKOUT_STAGE_ORDER: KnockoutStage[] = [
  'R32',
  'R16',
  'QF',
  'SF',
  'Third',
  'Final'
]

type KnockoutState = Partial<Record<KnockoutStage, Record<string, MatchWinner>>>

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      byStage: Partial<Record<KnockoutStage, Match[]>>
      lastUpdated: string
    }

function buildStageMap(matches: Match[]): Partial<Record<KnockoutStage, Match[]>> {
  const stageMap: Partial<Record<KnockoutStage, Match[]>> = {}
  for (const match of matches) {
    if (match.stage === 'Group') continue
    const stage = match.stage as KnockoutStage
    const list = stageMap[stage] ?? []
    list.push(match)
    stageMap[stage] = list
  }
  for (const stage of KNOCKOUT_STAGE_ORDER) {
    stageMap[stage]?.sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    )
  }
  return stageMap
}

function persistLocalKnockout(userId: string, knockout: KnockoutState, mode: 'default' | 'demo'): void {
  const existing = loadLocalBracketPrediction(userId, mode)
  const now = new Date().toISOString()
  saveLocalBracketPrediction(userId, {
    id: existing?.id ?? `bracket-${userId}`,
    userId,
    groups: existing?.groups ?? {},
    bestThirds: existing?.bestThirds ?? [],
    knockout,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }, mode)
}

export function useBracketKnockoutData() {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'
  const userId = useViewerId()

  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [knockout, setKnockout] = useState<KnockoutState>({})
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
      setLoadState({ status: 'loading' })
      try {
        const matchesFile = await fetchMatches({ mode })
        if (canceled) return

        let nextKnockout: KnockoutState | null = null
        if (firestoreEnabled) {
          const remote = await fetchUserBracketKnockoutDoc(userId)
          if (remote) nextKnockout = remote
        }

        if (!nextKnockout) {
          const local = loadLocalBracketPrediction(userId, mode)
          if (local?.knockout && Object.keys(local.knockout).length > 0) {
            nextKnockout = local.knockout
          }
        }

        if (!nextKnockout) {
          const seed = await fetchBracketPredictions({ mode })
          const combined = combineBracketPredictions(seed)
          const fallback = combined.find((entry) => entry.userId === userId) ?? combined[0]
          nextKnockout = fallback?.knockout ?? {}
        }

        const resolved = nextKnockout ?? {}
        persistLocalKnockout(userId, resolved, mode)
        if (canceled) return
        setKnockout(resolved)
        setSaveStatus('idle')
        setLoadState({
          status: 'ready',
          matches: matchesFile.matches,
          byStage: buildStageMap(matchesFile.matches),
          lastUpdated: matchesFile.lastUpdated
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setLoadState({ status: 'error', message })
      }
    }

    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, mode, userId])

  const totalMatches = useMemo(() => {
    if (loadState.status !== 'ready') return 0
    return Object.values(loadState.byStage).reduce((count, matches) => count + (matches?.length ?? 0), 0)
  }, [loadState])

  const completeMatches = useMemo(() => {
    if (loadState.status !== 'ready') return 0
    let complete = 0
    for (const stage of KNOCKOUT_STAGE_ORDER) {
      const matches = loadState.byStage[stage] ?? []
      const picks = knockout[stage] ?? {}
      for (const match of matches) {
        if (picks[match.id]) complete += 1
      }
    }
    return complete
  }, [knockout, loadState])

  const setPick = useCallback(
    (stage: KnockoutStage, matchId: string, winner: MatchWinner | undefined) => {
      setKnockout((current) => {
        const stagePicks = { ...(current[stage] ?? {}) }
        if (winner) stagePicks[matchId] = winner
        else delete stagePicks[matchId]

        const next: KnockoutState = { ...current }
        if (Object.keys(stagePicks).length === 0) {
          delete next[stage]
        } else {
          next[stage] = stagePicks
        }
        persistLocalKnockout(userId, next, mode)
        return next
      })
      setSaveStatus('idle')
    },
    [mode, userId]
  )

  const save = useCallback(async () => {
    setSaveStatus('saving')
    try {
      persistLocalKnockout(userId, knockout, mode)
      if (firestoreEnabled) {
        await saveUserBracketKnockoutDoc(userId, knockout)
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [firestoreEnabled, knockout, mode, userId])

  return {
    loadState,
    knockout,
    setPick,
    save,
    saveStatus,
    canPersistFirestore: firestoreEnabled,
    stageOrder: KNOCKOUT_STAGE_ORDER,
    totalMatches,
    completeMatches
  }
}
