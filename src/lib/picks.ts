import type {
  Pick,
  PickAdvances,
  PickInput,
  PickOutcome,
  PickWinner,
  PicksFile
} from '../types/picks'
import type { Match } from '../types/matches'

const STORAGE_PREFIX = 'wc-picks'

export function getLocalStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

export function loadLocalPicks(userId: string): Pick[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(getLocalStorageKey(userId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as { picks?: Pick[] }
    return Array.isArray(parsed.picks) ? parsed.picks : []
  } catch {
    return []
  }
}

export function saveLocalPicks(userId: string, picks: Pick[]): void {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ picks })
  window.localStorage.setItem(getLocalStorageKey(userId), payload)
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
