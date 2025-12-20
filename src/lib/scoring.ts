import type { Match } from '../types/matches'
import type { Member } from '../types/members'
import type { Pick } from '../types/picks'
import type { KnockoutStage, ScoringConfig, StageScoring } from '../types/scoring'
import { getPredictedWinner, isPickComplete } from './picks'

export type LeaderboardEntry = {
  member: Member
  totalPoints: number
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  exactCount: number
  picksCount: number
  earliestSubmission?: string
}

type Outcome = 'WIN' | 'DRAW' | 'LOSS'

function getOutcomeFromScore(score: { home: number; away: number }): Outcome {
  if (score.home > score.away) return 'WIN'
  if (score.away > score.home) return 'LOSS'
  return 'DRAW'
}

function resolveStageConfig(match: Match, scoring: ScoringConfig): StageScoring {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function scoreExact(match: Match, pick: Pick, config: StageScoring) {
  if (!match.score) return { points: 0, exact: false }
  if (typeof pick.homeScore !== 'number' || typeof pick.awayScore !== 'number') {
    return { points: 0, exact: false }
  }
  const exact = pick.homeScore === match.score.home && pick.awayScore === match.score.away
  if (exact) return { points: config.exactScoreBoth, exact: true }
  const homeMatch = pick.homeScore === match.score.home
  const awayMatch = pick.awayScore === match.score.away
  if (homeMatch !== awayMatch) {
    return { points: config.exactScoreOne, exact: false }
  }
  return { points: 0, exact: false }
}

function scoreResult(match: Match, pick: Pick, config: StageScoring) {
  if (!match.score || !pick.outcome) return 0
  const actualOutcome = getOutcomeFromScore(match.score)
  if (pick.outcome === actualOutcome) return config.result
  return 0
}

function scoreKnockout(match: Match, pick: Pick, config: StageScoring) {
  if (match.stage === 'Group') return 0
  if (!match.winner || !config.knockoutWinner) return 0
  const predictedWinner = getPredictedWinner(pick)
  if (predictedWinner && predictedWinner === match.winner) {
    return config.knockoutWinner
  }
  return 0
}

export function buildLeaderboard(
  members: Member[],
  matches: Match[],
  picks: Pick[],
  scoring: ScoringConfig
): LeaderboardEntry[] {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const entries = new Map<string, LeaderboardEntry>()

  for (const member of members) {
    entries.set(member.id, {
      member,
      totalPoints: 0,
      exactPoints: 0,
      resultPoints: 0,
      knockoutPoints: 0,
      exactCount: 0,
      picksCount: 0
    })
  }

  for (const pick of picks) {
    const match = matchById.get(pick.matchId)
    if (!match || match.status !== 'FINISHED') continue
    if (!isPickComplete(match, pick)) continue

    const entry = entries.get(pick.userId)
    if (!entry) continue

    const config = resolveStageConfig(match, scoring)
    const exactResult = scoreExact(match, pick, config)
    const resultPoints = scoreResult(match, pick, config)
    const knockoutPoints = scoreKnockout(match, pick, config)

    entry.exactPoints += exactResult.points
    entry.resultPoints += resultPoints
    entry.knockoutPoints += knockoutPoints
    entry.totalPoints += exactResult.points + resultPoints + knockoutPoints
    entry.picksCount += 1
    if (exactResult.exact) entry.exactCount += 1

    const submissionTime = new Date(pick.createdAt).getTime()
    if (Number.isFinite(submissionTime)) {
      const existingTime = entry.earliestSubmission
        ? new Date(entry.earliestSubmission).getTime()
        : Number.POSITIVE_INFINITY
      if (submissionTime < existingTime) {
        entry.earliestSubmission = pick.createdAt
      }
    }
  }

  return [...entries.values()].sort((a, b) => {
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
