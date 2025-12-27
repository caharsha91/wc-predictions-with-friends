import fs from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'public', 'data')

async function loadJson(filename) {
  const filePath = path.join(DATA_DIR, filename)
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function flattenPicksFile(file) {
  const docs = Array.isArray(file.picks) ? file.picks : []
  return docs.flatMap((entry) => entry.picks ?? [])
}

function combineBracketPredictions(file) {
  const groupDocs = Array.isArray(file.group) ? file.group : []
  const knockoutDocs = Array.isArray(file.knockout) ? file.knockout : []
  const groupByUser = new Map(groupDocs.map((doc) => [doc.userId, doc]))
  const knockoutByUser = new Map(knockoutDocs.map((doc) => [doc.userId, doc]))
  const userIds = new Set([...groupByUser.keys(), ...knockoutByUser.keys()])
  const predictions = []
  for (const userId of userIds) {
    const groupDoc = groupByUser.get(userId)
    const knockoutDoc = knockoutByUser.get(userId)
    const updatedAt = (knockoutDoc && knockoutDoc.updatedAt) || (groupDoc && groupDoc.updatedAt)
    predictions.push({
      id: `bracket-${userId}`,
      userId,
      groups: (groupDoc && groupDoc.groups) || {},
      bestThirds: (groupDoc && groupDoc.bestThirds) || [],
      knockout: (knockoutDoc && knockoutDoc.knockout) || {},
      createdAt: updatedAt || new Date().toISOString(),
      updatedAt: updatedAt || new Date().toISOString()
    })
  }
  return predictions
}

function getOutcomeFromScore(score) {
  if (score.home > score.away) return 'WIN'
  if (score.away > score.home) return 'LOSS'
  return 'DRAW'
}

function getOutcomeFromScores(homeScore, awayScore) {
  if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return undefined
  if (homeScore > awayScore) return 'WIN'
  if (homeScore < awayScore) return 'LOSS'
  return 'DRAW'
}

function resolveStageConfig(match, scoring) {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage]
}

function scoreExact(match, pick, config) {
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

function scoreResult(match, pick, config) {
  if (!match.score || !pick.outcome) return 0
  const actualOutcome = getOutcomeFromScore(match.score)
  if (pick.outcome === actualOutcome) return config.result
  return 0
}

function scoreKnockout(match, pick, config) {
  if (match.stage === 'Group') return 0
  if (!match.winner || !config.knockoutWinner) return 0
  let predictedWinner
  if (pick.winner === 'HOME' || pick.winner === 'AWAY') {
    predictedWinner = pick.winner
  } else if (pick.outcome === 'WIN') {
    predictedWinner = 'HOME'
  } else if (pick.outcome === 'LOSS') {
    predictedWinner = 'AWAY'
  }
  if (predictedWinner && predictedWinner === match.winner) {
    return config.knockoutWinner
  }
  return 0
}

function buildGroupStandings(matches) {
  const groups = new Map()

  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const group = groups.get(match.group) ?? {
      complete: true,
      teams: new Map()
    }

    const ensureTeam = (team) => {
      const existing = group.teams.get(team.code)
      if (existing) return existing
      const created = {
        team,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0
      }
      group.teams.set(team.code, created)
      return created
    }

    ensureTeam(match.homeTeam)
    ensureTeam(match.awayTeam)

    if (match.status !== 'FINISHED' || !match.score) {
      group.complete = false
      groups.set(match.group, group)
      continue
    }

    const home = ensureTeam(match.homeTeam)
    const away = ensureTeam(match.awayTeam)
    home.goalsFor += match.score.home
    home.goalsAgainst += match.score.away
    away.goalsFor += match.score.away
    away.goalsAgainst += match.score.home
    home.goalDiff = home.goalsFor - home.goalsAgainst
    away.goalDiff = away.goalsFor - away.goalsAgainst

    if (match.score.home > match.score.away) {
      home.points += 3
    } else if (match.score.home < match.score.away) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }

    groups.set(match.group, group)
  }

  const summaries = new Map()
  for (const [groupId, group] of groups.entries()) {
    const standings = [...group.teams.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
      return a.team.code.localeCompare(b.team.code)
    })
    summaries.set(groupId, { complete: group.complete, standings })
  }

  return summaries
}

function normalizeTeamCodes(codes) {
  if (!codes) return []
  const normalized = codes
    .map((code) => String(code ?? '').trim().toUpperCase())
    .filter((code) => code.length > 0)
  return [...new Set(normalized)]
}

function resolveBestThirdQualifiers(groupStandings, overrides) {
  const overrideCodes = normalizeTeamCodes(overrides)
  if (overrideCodes.length > 0) return overrideCodes

  const thirdPlaceTeams = []
  for (const [groupId, summary] of groupStandings.entries()) {
    if (!summary.complete) return undefined
    const third = summary.standings[2]
    if (!third) return undefined
    thirdPlaceTeams.push({ ...third, groupId })
  }

  thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.team.code.localeCompare(b.team.code)
  })

  return thirdPlaceTeams.slice(0, 8).map((entry) => entry.team.code)
}

function scoreBracketPrediction(prediction, matches, scoring, bestThirdQualifiers) {
  let points = 0
  const groupStandings = buildGroupStandings(matches)

  for (const [groupId, summary] of groupStandings.entries()) {
    if (!summary.complete) continue
    const actualTopTwo = summary.standings.slice(0, 2).map((entry) => entry.team.code)
    const predicted = prediction.groups[groupId]
    if (!predicted) continue
    if (predicted.first && actualTopTwo.includes(predicted.first)) {
      points += scoring.bracket.groupQualifiers
    }
    if (predicted.second && actualTopTwo.includes(predicted.second)) {
      points += scoring.bracket.groupQualifiers
    }
  }

  const actualBestThirds = resolveBestThirdQualifiers(groupStandings, bestThirdQualifiers)
  if (actualBestThirds && actualBestThirds.length > 0) {
    const predictedThirds = normalizeTeamCodes(prediction.bestThirds)
    const actualSet = new Set(actualBestThirds)
    const thirdPlacePoints = scoring.bracket.thirdPlaceQualifiers ?? scoring.bracket.groupQualifiers
    for (const code of predictedThirds) {
      if (actualSet.has(code)) points += thirdPlacePoints
    }
  }

  for (const match of matches) {
    if (match.stage === 'Group') continue
    if (match.status !== 'FINISHED' || !match.winner) continue
    const stage = match.stage
    const stagePredictions = prediction.knockout?.[stage]
    if (!stagePredictions) continue
    if (stagePredictions[match.id] === match.winner) {
      points += scoring.bracket.knockout[stage] ?? 0
    }
  }

  return points
}

function isPickComplete(match, pick) {
  if (!pick) return false
  const hasScores = typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number'
  const hasOutcome = pick.outcome === 'WIN' || pick.outcome === 'DRAW' || pick.outcome === 'LOSS'
  if (match.stage === 'Group') {
    return hasScores && hasOutcome
  }
  return hasScores && hasOutcome
}

function buildLeaderboard(members, matches, picks, bracketPredictions, scoring, bestThirdQualifiers) {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const entries = new Map()
  const bracketByUser = new Map(
    bracketPredictions.map((prediction) => [prediction.userId, prediction])
  )

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
    return a.member.name.localeCompare(b.member.name)
  })
}

function printTestResult(name, passed, details) {
  const status = passed ? 'PASS' : 'FAIL'
  console.log(`[${status}] ${name}`)
  if (details && details.length) {
    for (const line of details) {
      console.log(`  - ${line}`)
    }
  }
}

async function main() {
  const [
    matchesFile,
    picksFile,
    membersFile,
    bracketFile,
    scoring,
    bestThirdFile
  ] = await Promise.all([
    loadJson('matches-simulated.json'),
    loadJson('picks-simulated.json'),
    loadJson('members.json'),
    loadJson('bracket-predictions-simulated.json'),
    loadJson('scoring.json'),
    loadJson('best-third-qualifiers-simulated.json')
  ])

  const matches = matchesFile.matches
  const picks = flattenPicksFile(picksFile)
  const members = membersFile.members
  const bracketPredictions = combineBracketPredictions(bracketFile)
  const bestThirdQualifiers = bestThirdFile.qualifiers

  const testResults = []

  const groupMatches = matches.filter((match) => match.stage === 'Group')
  const knockoutMatches = matches.filter((match) => match.stage !== 'Group')
  const groupComplete = groupMatches.every(
    (match) => match.status === 'FINISHED' && match.score
  )
  const knockoutComplete = knockoutMatches.every(
    (match) => match.status === 'FINISHED' && match.score && match.winner && match.decidedBy
  )
  testResults.push({
    name: 'Match data completeness',
    passed:
      matches.length === 104 &&
      groupMatches.length === 72 &&
      knockoutMatches.length === 32 &&
      groupComplete &&
      knockoutComplete,
    details: [
      `matches=${matches.length}, group=${groupMatches.length}, knockout=${knockoutMatches.length}`,
      `groupComplete=${groupComplete}, knockoutComplete=${knockoutComplete}`
    ]
  })

  const picksByMatch = new Map()
  for (const pick of picks) {
    const list = picksByMatch.get(pick.matchId) ?? []
    list.push(pick)
    picksByMatch.set(pick.matchId, list)
  }
  const picksPerMatch = [...picksByMatch.values()].map((list) => list.length)
  const picksPerMatchOk = picksPerMatch.every((count) => count === members.length)
  const picksByUser = new Map()
  for (const pick of picks) {
    const list = picksByUser.get(pick.userId) ?? []
    list.push(pick)
    picksByUser.set(pick.userId, list)
  }
  const picksPerUserOk = [...picksByUser.values()].every(
    (list) => list.length === matches.length
  )
  testResults.push({
    name: 'Pick coverage (per match and per user)',
    passed: picksPerMatchOk && picksPerUserOk,
    details: [
      `picksPerMatchOk=${picksPerMatchOk}`,
      `picksPerUserOk=${picksPerUserOk}`
    ]
  })

  const incompletePicks = []
  const outcomeMismatches = []
  const matchById = new Map(matches.map((match) => [match.id, match]))
  for (const pick of picks) {
    const match = matchById.get(pick.matchId)
    if (!match) continue
    if (!isPickComplete(match, pick)) {
      incompletePicks.push(`${pick.userId}:${pick.matchId}`)
    }
    const outcomeFromScores = getOutcomeFromScores(pick.homeScore, pick.awayScore)
    if (outcomeFromScores && pick.outcome !== outcomeFromScores) {
      outcomeMismatches.push(`${pick.userId}:${pick.matchId}`)
    }
  }
  testResults.push({
    name: 'Pick completeness and outcome consistency',
    passed: incompletePicks.length === 0 && outcomeMismatches.length === 0,
    details: [
      `incompletePicks=${incompletePicks.length}`,
      `outcomeMismatches=${outcomeMismatches.length}`
    ]
  })

  const knockoutMismatch = []
  for (const pick of picks) {
    const match = matchById.get(pick.matchId)
    if (!match || match.stage === 'Group') continue
    if (!match.score) continue
    if (pick.homeScore !== match.score.home || pick.awayScore !== match.score.away) {
      knockoutMismatch.push(`${pick.userId}:${pick.matchId}:score`)
      continue
    }
    if (pick.winner !== match.winner) {
      knockoutMismatch.push(`${pick.userId}:${pick.matchId}:winner`)
      continue
    }
    if (pick.decidedBy !== match.decidedBy) {
      knockoutMismatch.push(`${pick.userId}:${pick.matchId}:decider`)
    }
  }
  testResults.push({
    name: 'Knockout picks align with simulated results',
    passed: knockoutMismatch.length === 0,
    details: [`mismatches=${knockoutMismatch.length}`]
  })

  const knockoutScoringMismatches = []
  for (const pick of picks) {
    const match = matchById.get(pick.matchId)
    if (!match || match.stage === 'Group') continue
    const config = resolveStageConfig(match, scoring)
    const exactResult = scoreExact(match, pick, config)
    const resultPoints = scoreResult(match, pick, config)
    const knockoutPoints = scoreKnockout(match, pick, config)
    const expected =
      config.exactScoreBoth + config.result + (config.knockoutWinner ?? 0)
    const actual = exactResult.points + resultPoints + knockoutPoints
    if (actual !== expected) {
      knockoutScoringMismatches.push(`${pick.userId}:${pick.matchId}:${actual}`)
    }
  }
  testResults.push({
    name: 'Knockout scoring awards max points for aligned picks',
    passed: knockoutScoringMismatches.length === 0,
    details: [`mismatches=${knockoutScoringMismatches.length}`]
  })

  const groupStandings = buildGroupStandings(matches)
  const computedBestThirds = resolveBestThirdQualifiers(groupStandings)
  const bestThirdMatches =
    computedBestThirds &&
    computedBestThirds.length === bestThirdQualifiers.length &&
    computedBestThirds.every((code) => bestThirdQualifiers.includes(code))
  testResults.push({
    name: 'Best-third qualifiers match computed standings',
    passed: Boolean(bestThirdMatches),
    details: [
      `computed=${computedBestThirds ? computedBestThirds.join(',') : 'n/a'}`,
      `file=${bestThirdQualifiers.join(',')}`
    ]
  })

  const stageCounts = new Map()
  for (const match of matches) {
    if (match.stage === 'Group') continue
    stageCounts.set(match.stage, (stageCounts.get(match.stage) ?? 0) + 1)
  }
  const maxGroupPoints = groupStandings.size * scoring.bracket.groupQualifiers * 2
  const thirdPoints =
    (scoring.bracket.thirdPlaceQualifiers ?? scoring.bracket.groupQualifiers) * 8
  let maxKnockoutPoints = 0
  for (const [stage, count] of stageCounts.entries()) {
    maxKnockoutPoints += count * (scoring.bracket.knockout[stage] ?? 0)
  }
  const maxBracketPoints = maxGroupPoints + thirdPoints + maxKnockoutPoints

  const bracketMismatches = []
  for (const prediction of bracketPredictions) {
    const points = scoreBracketPrediction(
      prediction,
      matches,
      scoring,
      bestThirdQualifiers
    )
    if (points !== maxBracketPoints) {
      bracketMismatches.push(`${prediction.userId}:${points}`)
    }
  }
  testResults.push({
    name: 'Bracket scoring is maxed for simulated predictions',
    passed: bracketMismatches.length === 0,
    details: [
      `maxBracketPoints=${maxBracketPoints}`,
      `mismatches=${bracketMismatches.length}`
    ]
  })

  const leaderboard = buildLeaderboard(
    members,
    matches,
    picks,
    bracketPredictions,
    scoring,
    bestThirdQualifiers
  )
  const totalsOk = leaderboard.every(
    (entry) =>
      entry.totalPoints ===
      entry.exactPoints +
        entry.resultPoints +
        entry.knockoutPoints +
        entry.bracketPoints
  )
  testResults.push({
    name: 'Leaderboard totals match component sums',
    passed: totalsOk,
    details: [`entries=${leaderboard.length}`]
  })

  console.log('Scoring tests for simulated data')
  console.log('================================')
  for (const result of testResults) {
    printTestResult(result.name, result.passed, result.details)
  }

  console.log('')
  console.log('Leaderboard summary')
  console.log('-------------------')
  for (const entry of leaderboard) {
    console.log(
      `${entry.member.name} | total=${entry.totalPoints} exact=${entry.exactPoints} result=${entry.resultPoints} knockout=${entry.knockoutPoints} bracket=${entry.bracketPoints} picks=${entry.picksCount}`
    )
  }

  const failed = testResults.filter((result) => !result.passed)
  if (failed.length > 0) {
    console.log('')
    console.log('Failed tests')
    console.log('------------')
    for (const result of failed) {
      console.log(result.name)
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
