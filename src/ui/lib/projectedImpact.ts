import type { LeaderboardEntry } from '../../types/leaderboard'
import { resolveLeaderboardIdentityKeys } from './leaderboardContext'

export type ProjectedImpactRow = {
  userId: string
  name: string
  baseRank: number
  projectedRank: number
  deltaRank: number
  deltaPoints: number
  isYou: boolean
}

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function getEntryUserId(entry: LeaderboardEntry): string {
  return entry.member.id || entry.member.name
}

function resolveDeltaPoints(
  entry: LeaderboardEntry,
  projectedGroupStagePointsByUser: Record<string, number>
): number {
  for (const key of resolveLeaderboardIdentityKeys(entry)) {
    const normalized = normalizeKey(key)
    if (!normalized) continue
    const points = projectedGroupStagePointsByUser[normalized]
    if (typeof points === 'number' && Number.isFinite(points)) return points
  }
  return 0
}

export function buildProjectedImpactRows({
  frozenLeaderboardRows,
  projectedGroupStagePointsByUser,
  currentUserId
}: {
  frozenLeaderboardRows: LeaderboardEntry[]
  projectedGroupStagePointsByUser: Record<string, number>
  currentUserId?: string | null
}): ProjectedImpactRow[] {
  const currentUserKey = normalizeKey(currentUserId)
  const baseRows = frozenLeaderboardRows.map((entry, index) => {
    const userId = getEntryUserId(entry)
    const deltaPoints = resolveDeltaPoints(entry, projectedGroupStagePointsByUser)
    return {
      userId,
      name: entry.member.name,
      baseRank: index + 1,
      baseTotalPoints: entry.totalPoints,
      projectedTotalPoints: entry.totalPoints + deltaPoints,
      deltaPoints,
      isYou:
        currentUserKey !== null &&
        resolveLeaderboardIdentityKeys(entry).some((key) => normalizeKey(key) === currentUserKey)
    }
  })

  const ranked = [...baseRows].sort((a, b) => {
    if (b.projectedTotalPoints !== a.projectedTotalPoints) {
      return b.projectedTotalPoints - a.projectedTotalPoints
    }
    if (a.baseRank !== b.baseRank) return a.baseRank - b.baseRank
    return a.userId.localeCompare(b.userId)
  })

  const projectedRankByUser = new Map<string, number>()
  for (let index = 0; index < ranked.length; index += 1) {
    projectedRankByUser.set(ranked[index].userId, index + 1)
  }

  return baseRows.map((row) => {
    const projectedRank = projectedRankByUser.get(row.userId) ?? row.baseRank
    return {
      userId: row.userId,
      name: row.name,
      baseRank: row.baseRank,
      projectedRank,
      deltaRank: row.baseRank - projectedRank,
      deltaPoints: row.deltaPoints,
      isYou: row.isYou
    }
  })
}
