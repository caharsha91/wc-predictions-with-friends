import type { Match } from '../types/matches'
import type { Pick, PickInput, PickOutcome, PickWinner } from '../types/picks'

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

export function upsertPick(picks: Pick[], input: PickInput): Pick[] {
  const now = new Date().toISOString()
  const index = picks.findIndex(
    (pick) => pick.matchId === input.matchId && pick.userId === input.userId
  )

  if (index === -1) {
    const next: Pick = {
      id: `pick-${input.userId}-${input.matchId}`,
      matchId: input.matchId,
      userId: input.userId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
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

export function isPickComplete(match: Match, pick?: Pick): boolean {
  if (!pick) return false
  const hasScores = typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number'
  const hasOutcome = pick.outcome === 'WIN' || pick.outcome === 'DRAW' || pick.outcome === 'LOSS'
  if (match.stage === 'Group') {
    return hasScores && hasOutcome
  }
  return hasScores && hasOutcome
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

export function getPredictedWinner(pick: Pick): PickWinner | undefined {
  if (pick.winner === 'HOME' || pick.winner === 'AWAY') return pick.winner
  if (pick.outcome === 'WIN') return 'HOME'
  if (pick.outcome === 'LOSS') return 'AWAY'
  return undefined
}

export function mergePicks(basePicks: Pick[], localPicks: Pick[], userId: string): Pick[] {
  const others = basePicks.filter((pick) => pick.userId !== userId)
  return [...others, ...localPicks]
}
