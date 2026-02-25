import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'

import { combineBracketPredictions } from '../../lib/bracket'
import { fetchBestThirdQualifiers, fetchBracketPredictions, fetchLeaderboard, fetchMatches, fetchScoring } from '../../lib/data'
import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import {
  buildGroupStandingsSnapshot,
  hasExactBestThirdSelection,
  normalizeTeamCodes
} from '../../lib/groupStageSnapshot'
import { resolveStoredTopTwo } from '../../lib/groupRanking'
import type { GroupPrediction } from '../../types/bracket'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import { useDemoScenarioState } from './useDemoScenarioState'
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

type ProjectedGroupPrediction = {
  userId: string
  groups: Record<string, GroupPrediction>
  bestThirds?: string[]
}

async function fetchProjectedGroupPredictions(mode: 'default' | 'demo'): Promise<ProjectedGroupPrediction[]> {
  if (mode === 'demo') {
    const bracketFile = await fetchBracketPredictions({ mode })
    return combineBracketPredictions(bracketFile).map((prediction) => ({
      userId: prediction.userId,
      groups: prediction.groups ?? {},
      bestThirds: prediction.bestThirds ?? []
    }))
  }

  if (!hasFirebase || !firebaseDb) {
    const bracketFile = await fetchBracketPredictions({ mode })
    return combineBracketPredictions(bracketFile).map((prediction) => ({
      userId: prediction.userId,
      groups: prediction.groups ?? {},
      bestThirds: prediction.bestThirds ?? []
    }))
  }

  try {
    const snapshot = await getDocs(collection(firebaseDb, 'leagues', getLeagueId(), 'bracket-group'))
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as {
        userId?: unknown
        groups?: unknown
        bestThirds?: unknown
      }
      return {
        userId:
          typeof data.userId === 'string' && data.userId.trim()
            ? data.userId.trim()
            : docSnap.id,
        groups:
          typeof data.groups === 'object' && data.groups !== null
            ? (data.groups as Record<string, GroupPrediction>)
            : {},
        bestThirds: Array.isArray(data.bestThirds)
          ? data.bestThirds.filter((value): value is string => typeof value === 'string')
          : []
      }
    })
  } catch (error) {
    // Non-admin users may not have list access to all bracket-group docs.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      String((error as { code: string }).code).includes('permission-denied')
    ) {
      return []
    }
    throw error
  }
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
  bracketPredictions: ProjectedGroupPrediction[]
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
      const topTwo = resolveStoredTopTwo(predictedGroup, groupStandings.map((entry) => entry.code))
      if (topTwo.first && topTwo.first === groupStandings[0].code) {
        points += groupQualifierPoints
      }
      if (topTwo.second && topTwo.second === groupStandings[1].code) {
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
  }

  return pointsByKey
}

export function usePublishedSnapshot() {
  const mode = useRouteDataMode()
  const demoScenario = useDemoScenarioState()
  const [state, setState] = useState<PublishedSnapshotState>({ status: 'loading' })

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [leaderboardFile, matchesFile, bestThirdFile, scoring, bracketPredictions] = await Promise.all([
          fetchLeaderboard({ mode }),
          fetchMatches({ mode }),
          fetchBestThirdQualifiers({ mode }),
          fetchScoring({ mode }),
          fetchProjectedGroupPredictions(mode)
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
          bracketPredictions,
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
  }, [demoScenario, mode])

  return useMemo(() => ({ state }), [state])
}
