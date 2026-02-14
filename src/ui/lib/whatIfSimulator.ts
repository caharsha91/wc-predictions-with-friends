import { getOutcomeFromScores, getPickOutcome, getPredictedWinner, isPickComplete } from '../../lib/picks'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { ScoringConfig, StageScoring } from '../../types/scoring'
import { resolveLeaderboardIdentityKeys } from './leaderboardContext'

type UserPickDoc = {
  userId: string
  picks: Pick[]
  updatedAt: string
}

export type SimulatedMatchOutcome = {
  homeScore: number
  awayScore: number
  advances?: 'HOME' | 'AWAY'
}

export type ProjectedLeaderboardRow = {
  entry: LeaderboardEntry
  projectedTotalPoints: number
  projectedDelta: number
  projectedRank: number
}

function resolveStageScoring(match: Match, scoring: ScoringConfig): StageScoring {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage]
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

function selectLatestPickByMatch(picks: Pick[]): Map<string, Pick> {
  const byMatch = new Map<string, Pick>()
  for (const pick of picks) {
    const existing = byMatch.get(pick.matchId)
    if (!existing) {
      byMatch.set(pick.matchId, pick)
      continue
    }
    if (new Date(pick.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byMatch.set(pick.matchId, pick)
    }
  }
  return byMatch
}

function scoreProjectedPick(
  match: Match,
  pick: Pick | undefined,
  simulated: SimulatedMatchOutcome,
  scoring: ScoringConfig
): number {
  if (!pick || !isPickComplete(match, pick)) return 0

  const config = resolveStageScoring(match, scoring)
  let points = 0

  if (
    typeof pick.homeScore === 'number' &&
    typeof pick.awayScore === 'number'
  ) {
    if (pick.homeScore === simulated.homeScore && pick.awayScore === simulated.awayScore) {
      points += config.exactScoreBoth
    } else if (pick.homeScore === simulated.homeScore || pick.awayScore === simulated.awayScore) {
      points += config.exactScoreOne
    }
  }

  const predictedOutcome = getPickOutcome(pick)
  const simulatedOutcome = getOutcomeFromScores(simulated.homeScore, simulated.awayScore)
  if (predictedOutcome && simulatedOutcome && predictedOutcome === simulatedOutcome) {
    points += config.result
  }

  if (match.stage !== 'Group' && config.knockoutWinner) {
    const simulatedWinner =
      simulated.homeScore > simulated.awayScore
        ? 'HOME'
        : simulated.awayScore > simulated.homeScore
          ? 'AWAY'
          : simulated.advances
    const decidedByTieBreaker =
      simulated.homeScore === simulated.awayScore && (simulated.advances === 'HOME' || simulated.advances === 'AWAY')

    if (decidedByTieBreaker && simulatedWinner) {
      const predictedWinner = getPredictedWinner(pick)
      if (predictedWinner && predictedWinner === simulatedWinner) {
        points += config.knockoutWinner
      }
    }
  }

  return points
}

export function buildProjectedLeaderboard(
  entries: LeaderboardEntry[],
  matches: Match[],
  picksDocs: UserPickDoc[],
  scoring: ScoringConfig,
  simulatedOutcomes: Record<string, SimulatedMatchOutcome>
): ProjectedLeaderboardRow[] {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const picksByUser = new Map<string, Pick[]>()

  for (const doc of picksDocs) {
    const key = normalizeKey(doc.userId)
    const current = picksByUser.get(key) ?? []
    current.push(...doc.picks)
    picksByUser.set(key, current)
  }

  const projectedRows: ProjectedLeaderboardRow[] = entries.map((entry) => {
    const entryKeys = resolveLeaderboardIdentityKeys(entry)
    const allPicks: Pick[] = []
    for (const key of entryKeys) {
      const picks = picksByUser.get(key)
      if (picks) allPicks.push(...picks)
    }
    const pickByMatch = selectLatestPickByMatch(allPicks)

    let projectedGain = 0
    for (const [matchId, outcome] of Object.entries(simulatedOutcomes)) {
      const match = matchById.get(matchId)
      if (!match || match.status === 'FINISHED') continue
      const pick = pickByMatch.get(matchId)
      projectedGain += scoreProjectedPick(match, pick, outcome, scoring)
    }

    return {
      entry,
      projectedTotalPoints: entry.totalPoints + projectedGain,
      projectedDelta: projectedGain,
      projectedRank: 0
    }
  })

  projectedRows.sort((a, b) => {
    if (b.projectedTotalPoints !== a.projectedTotalPoints) {
      return b.projectedTotalPoints - a.projectedTotalPoints
    }
    if (b.entry.totalPoints !== a.entry.totalPoints) {
      return b.entry.totalPoints - a.entry.totalPoints
    }
    return a.entry.member.name.localeCompare(b.entry.member.name)
  })

  return projectedRows.map((row, index) => ({
    ...row,
    projectedRank: index + 1
  }))
}
