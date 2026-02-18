import { useEffect, useMemo, useState } from 'react'

import { combineBracketPredictions } from '../../lib/bracket'
import { fetchBestThirdQualifiers, fetchBracketPredictions, fetchLeaderboard, fetchMatches, fetchScoring } from '../../lib/data'
import {
  buildGroupStandingsSnapshot,
  hasExactBestThirdSelection,
  normalizeTeamCodes
} from '../../lib/groupStageSnapshot'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import { useRouteDataMode } from './useRouteDataMode'

type PublishedSnapshotState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      snapshotTimestamp: string
      groupStageComplete: boolean
      projectedGroupStagePointsByUser: Record<string, number>
      leaderboardRows: LeaderboardEntry[]
      matches: Match[]
      bestThirdQualifiers: string[]
    }

function normalizeKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

function resolveLatestTimestamp(values: string[]): string {
  return values.reduce((latest, candidate) => {
    const latestTime = new Date(latest).getTime()
    const candidateTime = new Date(candidate).getTime()
    if (!Number.isFinite(latestTime)) return candidate
    if (!Number.isFinite(candidateTime)) return latest
    return candidateTime > latestTime ? candidate : latest
  }, '')
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

function buildProjectedGroupStagePointsByUser({
  matches,
  qualifiers,
  leaderboardRows,
  bracketPredictions,
  groupQualifierPoints,
  thirdQualifierPoints
}: {
  matches: Match[]
  qualifiers: string[]
  leaderboardRows: LeaderboardEntry[]
  bracketPredictions: ReturnType<typeof combineBracketPredictions>
  groupQualifierPoints: number
  thirdQualifierPoints: number
}): Record<string, number> {
  const standings = buildGroupStandingsSnapshot(matches)
  const qualifiersSet = new Set(normalizeTeamCodes(qualifiers))
  const pointsByKey: Record<string, number> = {}

  for (const prediction of bracketPredictions) {
    const userKey = normalizeKey(prediction.userId)
    if (!userKey) continue
    let points = 0

    for (const [groupId, groupStandings] of standings.standingsByGroup.entries()) {
      if (groupStandings.length < 2) continue
      const predictedGroup = prediction.groups[groupId]
      if (!predictedGroup) continue
      if (predictedGroup.first && predictedGroup.first === groupStandings[0].code) {
        points += groupQualifierPoints
      }
      if (predictedGroup.second && predictedGroup.second === groupStandings[1].code) {
        points += groupQualifierPoints
      }
    }

    if (qualifiersSet.size > 0 && hasExactBestThirdSelection(prediction.bestThirds)) {
      for (const code of normalizeTeamCodes(prediction.bestThirds)) {
        if (qualifiersSet.has(code)) points += thirdQualifierPoints
      }
    }

    pointsByKey[userKey] = points
  }

  for (const row of leaderboardRows) {
    const idKey = normalizeKey(row.member.id)
    if (idKey && typeof pointsByKey[idKey] !== 'number') pointsByKey[idKey] = 0
    const emailKey = normalizeKey(row.member.email)
    if (emailKey && typeof pointsByKey[emailKey] !== 'number') pointsByKey[emailKey] = 0
    const uidKey = normalizeKey(row.member.uid)
    if (uidKey && typeof pointsByKey[uidKey] !== 'number') pointsByKey[uidKey] = 0
  }

  return pointsByKey
}

export function usePublishedSnapshot() {
  const mode = useRouteDataMode()
  const [state, setState] = useState<PublishedSnapshotState>({ status: 'loading' })

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [leaderboardFile, matchesFile, bestThirdFile, bracketFile, scoring] = await Promise.all([
          fetchLeaderboard({ mode }),
          fetchMatches({ mode }),
          fetchBestThirdQualifiers({ mode }),
          fetchBracketPredictions({ mode }),
          fetchScoring({ mode })
        ])
        if (canceled) return

        const standings = buildGroupStandingsSnapshot(matchesFile.matches)
        const groupIds = new Set(
          matchesFile.matches
            .filter((match) => match.stage === 'Group' && Boolean(match.group))
            .map((match) => String(match.group))
        )
        const groupStageComplete = groupIds.size > 0 && standings.completeGroups.size === groupIds.size
        const leaderboardRows = sortLeaderboardRows(leaderboardFile.entries)
        const projectedGroupStagePointsByUser = buildProjectedGroupStagePointsByUser({
          matches: matchesFile.matches,
          qualifiers: bestThirdFile.qualifiers ?? [],
          leaderboardRows,
          bracketPredictions: combineBracketPredictions(bracketFile),
          groupQualifierPoints: scoring.bracket.groupQualifiers ?? 0,
          thirdQualifierPoints: scoring.bracket.thirdPlaceQualifiers ?? scoring.bracket.groupQualifiers ?? 0
        })
        const snapshotTimestamp = resolveLatestTimestamp(
          [leaderboardFile.lastUpdated, bestThirdFile.updatedAt].filter(Boolean)
        )

        setState({
          status: 'ready',
          snapshotTimestamp,
          groupStageComplete,
          projectedGroupStagePointsByUser,
          leaderboardRows,
          matches: matchesFile.matches,
          bestThirdQualifiers: normalizeTeamCodes(bestThirdFile.qualifiers ?? [])
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
  }, [mode])

  return useMemo(() => ({ state }), [state])
}

