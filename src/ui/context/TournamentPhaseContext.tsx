import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { fetchLeaderboard, fetchMatches } from '../../lib/data'
import type { DataMode } from '../../lib/dataMode'
import { resolveTournamentDeadlines, type TournamentDeadlines } from '../../lib/tournamentDeadlines'
import { useDemoScenarioState } from '../hooks/useDemoScenarioState'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { readDemoNowOverride, readDemoPhaseOverride, resolveDemoScenarioPhase } from '../lib/demoControls'
import {
  computeKoDrawConfirmedSignal,
  computeTournamentPhase,
  type TournamentPhase,
  type TournamentPhaseState
} from '../lib/tournamentPhase'

const DEFAULT_PHASE_STATE: TournamentPhaseState = computeTournamentPhase({
  mode: 'prod',
  nowUtc: new Date().toISOString(),
  deadlines: { groupStageDeadlineUtc: '', firstKoKickoffUtc: null },
  koDrawConfirmedSignal: false,
  snapshotFields: {
    snapshotPublishedAt: null,
    snapshotPhase: null,
    snapshotGroupLocked: null,
    snapshotKoLocked: null,
    snapshotFinalized: null
  },
  selectedDemoPhase: null,
  demoOverride: null
})

type TournamentPhaseContextValue = {
  state: TournamentPhaseState
}

const TournamentPhaseContext = createContext<TournamentPhaseContextValue>({ state: DEFAULT_PHASE_STATE })

function toPhaseEngineMode(mode: DataMode): 'prod' | 'demo' {
  return mode === 'demo' ? 'demo' : 'prod'
}

function resolveNowUtc(mode: DataMode): string {
  if (mode === 'demo') {
    return readDemoNowOverride() ?? new Date().toISOString()
  }
  return new Date().toISOString()
}

function parseUtcMs(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function TournamentPhaseProvider({ children }: { children: ReactNode }) {
  const mode = useRouteDataMode()
  const demoScenario = useDemoScenarioState()
  const [nowUtc, setNowUtc] = useState<string>(() => resolveNowUtc(mode))
  const [deadlines, setDeadlines] = useState<TournamentDeadlines>({
    groupStageDeadlineUtc: '',
    firstKoKickoffUtc: null
  })
  const [snapshotPublishedAt, setSnapshotPublishedAt] = useState<string | null>(null)
  const [koDrawConfirmedSignal, setKoDrawConfirmedSignal] = useState(false)

  useEffect(() => {
    setNowUtc(resolveNowUtc(mode))

    if (typeof window === 'undefined') return
    const syncNow = () => setNowUtc(resolveNowUtc(mode))
    window.addEventListener('storage', syncNow)
    window.addEventListener('hashchange', syncNow)
    window.addEventListener('wc-demo-controls-changed', syncNow as EventListener)
    window.addEventListener('wc-demo-scenario-changed', syncNow as EventListener)
    return () => {
      window.removeEventListener('storage', syncNow)
      window.removeEventListener('hashchange', syncNow)
      window.removeEventListener('wc-demo-controls-changed', syncNow as EventListener)
      window.removeEventListener('wc-demo-scenario-changed', syncNow as EventListener)
    }
  }, [mode])

  useEffect(() => {
    let canceled = false
    async function loadPhaseSources() {
      try {
        const [matchesFile, leaderboardFile] = await Promise.all([
          fetchMatches({ mode }),
          fetchLeaderboard({ mode })
        ])
        if (canceled) return
        setDeadlines(resolveTournamentDeadlines(matchesFile.matches))
        setKoDrawConfirmedSignal(computeKoDrawConfirmedSignal(matchesFile.matches))
        setSnapshotPublishedAt(leaderboardFile.lastUpdated || null)
      } catch {
        if (canceled) return
        setDeadlines({ groupStageDeadlineUtc: '', firstKoKickoffUtc: null })
        setKoDrawConfirmedSignal(false)
        setSnapshotPublishedAt(null)
      }
    }
    void loadPhaseSources()
    return () => {
      canceled = true
    }
  }, [mode, demoScenario])

  const selectedDemoPhase = mode === 'demo' ? (resolveDemoScenarioPhase(demoScenario) as TournamentPhase | null) : null
  const demoOverride = mode === 'demo' ? readDemoPhaseOverride() : null

  const state = useMemo(
    () =>
      computeTournamentPhase({
        mode: toPhaseEngineMode(mode),
        nowUtc,
        deadlines,
        koDrawConfirmedSignal,
        snapshotFields: {
          snapshotPublishedAt,
          snapshotPhase: null,
          snapshotGroupLocked: null,
          snapshotKoLocked: null,
          snapshotFinalized: null
        },
        selectedDemoPhase,
        demoOverride
      }),
    [deadlines, demoOverride, koDrawConfirmedSignal, mode, nowUtc, selectedDemoPhase, snapshotPublishedAt]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nowMs = parseUtcMs(nowUtc) ?? Date.now()
    const boundaries = [parseUtcMs(deadlines.groupStageDeadlineUtc), parseUtcMs(deadlines.firstKoKickoffUtc)]
      .filter((value): value is number => value !== null)
      .filter((value) => value > nowMs)
      .sort((a, b) => a - b)
    const targetMs = boundaries[0] ?? nowMs + 60_000
    const timeoutMs = Math.max(0, targetMs - nowMs)
    const timeoutId = window.setTimeout(() => setNowUtc(resolveNowUtc(mode)), timeoutMs)
    return () => window.clearTimeout(timeoutId)
  }, [deadlines.firstKoKickoffUtc, deadlines.groupStageDeadlineUtc, mode, nowUtc])

  return <TournamentPhaseContext.Provider value={{ state }}>{children}</TournamentPhaseContext.Provider>
}

export function useTournamentPhaseState(): TournamentPhaseState {
  return useContext(TournamentPhaseContext).state
}
