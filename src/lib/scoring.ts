import type { LeaderboardEntry } from '../types/leaderboard'
import type { Match } from '../types/matches'
import type { Member } from '../types/members'
import type { Pick } from '../types/picks'
import type { BracketPrediction } from '../types/bracket'
import type { KnockoutStage, ScoringConfig, StageScoring } from '../types/scoring'
import { getOutcomeFromScores, getPickOutcome, getPredictedWinner, isPickComplete } from './picks'
import { buildGroupStandingsSnapshot, hasExactBestThirdSelection, normalizeTeamCodes } from './groupStageSnapshot'
import { resolveStoredTopTwo } from './groupRanking'

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
  if (!match.score) return 0
  const predictedOutcome = getPickOutcome(pick) ?? getOutcomeFromScores(pick.homeScore, pick.awayScore)
  if (!predictedOutcome) return 0
  const actualOutcome = getOutcomeFromScore(match.score)
  if (predictedOutcome === actualOutcome) return config.result
  return 0
}

function scoreKnockout(match: Match, pick: Pick, config: StageScoring) {
  if (match.stage === 'Group') return 0
  if (!match.winner || !config.knockoutWinner) return 0
  if (match.decidedBy !== 'ET' && match.decidedBy !== 'PENS') return 0
  const predictedWinner = getPredictedWinner(pick)
  if (predictedWinner && predictedWinner === match.winner) {
    return config.knockoutWinner
  }
  return 0
}

function resolveBestThirdQualifiers(
  overrides?: string[]
): string[] | undefined {
  const overrideCodes = normalizeTeamCodes(overrides)
  if (overrideCodes.length >= 8) return overrideCodes.slice(0, 8)
  return undefined
}

function scoreBracketPrediction(
  prediction: BracketPrediction,
  matches: Match[],
  scoring: ScoringConfig,
  bestThirdQualifiers?: string[]
): number {
  let points = 0
  const groupStandings = buildGroupStandingsSnapshot(matches)

  for (const [groupId, standings] of groupStandings.standingsByGroup.entries()) {
    if (!groupStandings.completeGroups.has(groupId)) continue
    const actualTopTwo = standings.slice(0, 2).map((entry) => entry.code)
    const predicted = prediction.groups[groupId]
    if (!predicted) continue
    const topTwo = resolveStoredTopTwo(predicted, standings.map((entry) => entry.code))
    if (topTwo.first && topTwo.first === actualTopTwo[0]) {
      points += scoring.bracket.groupQualifiers
    }
    if (topTwo.second && topTwo.second === actualTopTwo[1]) {
      points += scoring.bracket.groupQualifiers
    }
  }

  const actualBestThirds = resolveBestThirdQualifiers(bestThirdQualifiers)
  if (actualBestThirds && actualBestThirds.length > 0) {
    const predictedThirds = normalizeTeamCodes(prediction.bestThirds)
    if (!hasExactBestThirdSelection(prediction.bestThirds)) return points
    const actualSet = new Set(actualBestThirds)
    const thirdPlacePoints = scoring.bracket.thirdPlaceQualifiers ?? scoring.bracket.groupQualifiers
    for (const code of predictedThirds) {
      if (actualSet.has(code)) points += thirdPlacePoints
    }
  }

  for (const match of matches) {
    if (match.stage === 'Group') continue
    if (match.status !== 'FINISHED' || !match.winner) continue
    const stage = match.stage as KnockoutStage
    const stagePredictions = prediction.knockout?.[stage]
    if (!stagePredictions) continue
    if (stagePredictions[match.id] === match.winner) {
      points += scoring.bracket.knockout[stage] ?? 0
    }
  }

  return points
}

export function buildLeaderboard(
  members: Member[],
  matches: Match[],
  picks: Pick[],
  bracketPredictions: BracketPrediction[],
  scoring: ScoringConfig,
  bestThirdQualifiers?: string[]
): LeaderboardEntry[] {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const entries = new Map<string, LeaderboardEntry>()
  const bracketByUser = new Map(bracketPredictions.map((prediction) => [prediction.userId, prediction]))

  for (const member of members) {
    entries.set(member.id, {
      member,
      totalPoints: 0,
      exactPoints: 0,
      resultPoints: 0,
      knockoutPoints: 0,
      bracketPoints: 0,
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

  for (const entry of entries.values()) {
    const prediction = bracketByUser.get(entry.member.id)
    if (!prediction) continue
    const bracketPoints = scoreBracketPrediction(
      prediction,
      matches,
      scoring,
      bestThirdQualifiers
    )
    entry.bracketPoints = bracketPoints
    entry.totalPoints += bracketPoints
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
