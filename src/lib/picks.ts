import type {
  Pick,
  PickAdvances,
  PickInput,
  PickOutcome,
  PickWinner,
  PicksFile
} from '../types/picks'
import type { Match } from '../types/matches'
import type { DataMode } from './dataMode'

const STORAGE_PREFIX = 'wc-picks'
const DEMO_SCENARIO_STORAGE_KEY = 'wc-demo-scenario'
const DEMO_SCENARIOS = new Set([
  'pre-group',
  'mid-group',
  'end-group-draw-confirmed',
  'mid-knockout',
  'world-cup-final-pending'
])

function readDemoScenarioId(): string {
  if (typeof window === 'undefined') return 'pre-group'
  const raw = window.localStorage.getItem(DEMO_SCENARIO_STORAGE_KEY)?.trim() ?? ''
  return DEMO_SCENARIOS.has(raw) ? raw : 'pre-group'
}

function getLegacyDemoStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:demo:${userId}`
}

function parseStoredPicks(raw: string | null): Pick[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { picks?: Pick[] }
    return Array.isArray(parsed.picks) ? parsed.picks : []
  } catch {
    return null
  }
}

export function getLocalStorageKey(userId: string, mode: DataMode = 'default'): string {
  if (mode === 'demo') {
    return `${STORAGE_PREFIX}:${mode}:${readDemoScenarioId()}:${userId}`
  }
  return `${STORAGE_PREFIX}:${mode}:${userId}`
}

export function loadLocalPicks(userId: string, mode: DataMode = 'default'): Pick[] {
  if (typeof window === 'undefined') return []
  const scopedKey = getLocalStorageKey(userId, mode)
  const scoped = parseStoredPicks(window.localStorage.getItem(scopedKey))
  if (scoped !== null) return scoped

  if (mode === 'demo') {
    const legacyKey = getLegacyDemoStorageKey(userId)
    const legacy = parseStoredPicks(window.localStorage.getItem(legacyKey))
    if (legacy !== null) {
      window.localStorage.setItem(scopedKey, JSON.stringify({ picks: legacy }))
      window.localStorage.removeItem(legacyKey)
      return legacy
    }
  }

  return []
}

export function saveLocalPicks(userId: string, picks: Pick[], mode: DataMode = 'default'): void {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ picks })
  window.localStorage.setItem(getLocalStorageKey(userId, mode), payload)
  if (mode === 'demo') {
    window.localStorage.removeItem(getLegacyDemoStorageKey(userId))
  }
}

export function getOutcomeFromScores(
  homeScore?: number,
  awayScore?: number
): PickOutcome | undefined {
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return undefined
  if (homeScore > awayScore) return 'WIN'
  if (homeScore < awayScore) return 'LOSS'
  return 'DRAW'
}

export function getPickOutcome(pick?: Pick): PickOutcome | undefined {
  if (!pick) return undefined
  if (pick.outcome === 'WIN' || pick.outcome === 'DRAW' || pick.outcome === 'LOSS') {
    return pick.outcome
  }
  return getOutcomeFromScores(pick.homeScore, pick.awayScore)
}

export function getPredictedWinner(pick: Pick): PickWinner | undefined {
  if (pick.advances === 'HOME' || pick.advances === 'AWAY') return pick.advances
  if (pick.winner === 'HOME' || pick.winner === 'AWAY') return pick.winner
  const derivedOutcome = getPickOutcome(pick)
  if (derivedOutcome === 'WIN') return 'HOME'
  if (derivedOutcome === 'LOSS') return 'AWAY'
  return undefined
}

export function isPickComplete(match: Match, pick?: Pick): boolean {
  if (!pick) return false
  const hasScores = typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number'
  if (!hasScores) return false
  if (match.stage === 'Group') return true

  const derivedOutcome = getPickOutcome(pick)
  if (derivedOutcome === 'DRAW') {
    return Boolean(getPredictedWinner(pick))
  }
  return true
}

export function upsertPick(picks: Pick[], input: PickInput): Pick[] {
  const now = new Date().toISOString()
  const index = picks.findIndex(
    (pick) => pick.matchId === input.matchId && pick.userId === input.userId
  )

  const derivedOutcome = getOutcomeFromScores(input.homeScore, input.awayScore)

  if (index === -1) {
    const next: Pick = {
      id: `pick-${input.userId}-${input.matchId}`,
      matchId: input.matchId,
      userId: input.userId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      advances: input.advances,
      outcome: input.outcome ?? derivedOutcome,
      winner: input.winner,
      decidedBy: input.decidedBy,
      createdAt: now,
      updatedAt: now
    }
    return [...picks, next]
  }

  const existing = picks[index]
  const updated: Pick = {
    ...existing,
    ...input,
    // Keep legacy fields derived for backward compatibility, but treat scores/advances as source of truth.
    outcome: input.outcome ?? derivedOutcome,
    createdAt: existing.createdAt || now,
    updatedAt: now
  }
  const nextPicks = [...picks]
  nextPicks[index] = updated
  return nextPicks
}

export function findPick(picks: Pick[], matchId: string, userId: string): Pick | undefined {
  return picks.find((pick) => pick.matchId === matchId && pick.userId === userId)
}

export function getUserPicksFromFile(picksFile: PicksFile, userId: string): Pick[] {
  const doc = picksFile.picks.find((entry) => entry.userId === userId)
  return doc?.picks ?? []
}

export function flattenPicksFile(picksFile: PicksFile): Pick[] {
  return picksFile.picks.flatMap((entry) => entry.picks ?? [])
}

export function mergePicks(basePicks: Pick[], localPicks: Pick[], userId: string): Pick[] {
  const others = basePicks.filter((pick) => pick.userId !== userId)
  const localByMatch = new Map(localPicks.map((pick) => [pick.matchId, pick]))
  const baseForUser = basePicks.filter(
    (pick) => pick.userId === userId && !localByMatch.has(pick.matchId)
  )
  return [...others, ...baseForUser, ...localPicks]
}

export function normalizeAdvances(
  value: PickAdvances | PickWinner | undefined
): PickAdvances | undefined {
  return value === 'HOME' || value === 'AWAY' ? value : undefined
}
