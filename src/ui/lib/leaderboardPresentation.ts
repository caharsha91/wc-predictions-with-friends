import type { LeaderboardEntry } from '../../types/leaderboard'
import { resolveLeaderboardIdentityKeys } from './leaderboardContext'

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function sortLeaderboardRows(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.exactPoints !== a.exactPoints) return b.exactPoints - a.exactPoints
    if (b.resultPoints !== a.resultPoints) return b.resultPoints - a.resultPoints
    if (b.knockoutPoints !== a.knockoutPoints) return b.knockoutPoints - a.knockoutPoints
    const aTime = a.earliestSubmission ? new Date(a.earliestSubmission).getTime() : Number.POSITIVE_INFINITY
    const bTime = b.earliestSubmission ? new Date(b.earliestSubmission).getTime() : Number.POSITIVE_INFINITY
    if (aTime !== bTime) return aTime - bTime
    return a.member.name.localeCompare(b.member.name)
  })
}

function resolveProjectedPoints(
  entry: LeaderboardEntry,
  projectedGroupStagePointsByUser: Record<string, number>
): number {
  for (const key of resolveLeaderboardIdentityKeys(entry)) {
    const normalized = normalizeKey(key)
    if (!normalized) continue
    const value = projectedGroupStagePointsByUser[normalized]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

export function buildLeaderboardPresentation({
  snapshotTimestamp,
  groupStageComplete,
  projectedGroupStagePointsByUser,
  leaderboardRows
}: {
  snapshotTimestamp: string
  groupStageComplete: boolean
  projectedGroupStagePointsByUser: Record<string, number>
  leaderboardRows: LeaderboardEntry[]
}): {
  rows: LeaderboardEntry[]
  isFrozen: boolean
  snapshotTimestamp: string
} {
  const isFrozen = !groupStageComplete
  const rows = isFrozen
    ? sortLeaderboardRows(
        leaderboardRows.map((entry) => {
          const projected = resolveProjectedPoints(entry, projectedGroupStagePointsByUser)
          if (projected <= 0) return entry
          const pointsToRemove = Math.min(projected, entry.bracketPoints)
          if (pointsToRemove <= 0) return entry
          return {
            ...entry,
            totalPoints: Math.max(0, entry.totalPoints - pointsToRemove),
            bracketPoints: Math.max(0, entry.bracketPoints - pointsToRemove)
          }
        })
      )
    : sortLeaderboardRows(leaderboardRows)

  return {
    rows,
    isFrozen,
    snapshotTimestamp
  }
}
