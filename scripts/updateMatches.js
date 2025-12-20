import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches'
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'data', 'matches.json')

function mapStage(stage) {
  const value = String(stage ?? '').toUpperCase()
  if (value.includes('GROUP')) return 'Group'
  if (value.includes('LAST_32') || value.includes('ROUND_OF_32')) return 'R32'
  if (value.includes('LAST_16') || value.includes('ROUND_OF_16')) return 'R16'
  if (value.includes('QUARTER')) return 'QF'
  if (value.includes('SEMI')) return 'SF'
  if (value.includes('THIRD')) return 'Third'
  if (value.includes('FINAL')) return 'Final'
  throw new Error(`Unknown stage: ${stage}`)
}

function mapStatus(status) {
  const value = String(status ?? '').toUpperCase()
  if (value === 'FINISHED') return 'FINISHED'
  if (value === 'IN_PLAY' || value === 'PAUSED') return 'IN_PLAY'
  if (value === 'SCHEDULED' || value === 'TIMED') return 'SCHEDULED'
  return 'SCHEDULED'
}

function mapWinner(winner) {
  const value = String(winner ?? '').toUpperCase()
  if (value === 'HOME_TEAM') return 'HOME'
  if (value === 'AWAY_TEAM') return 'AWAY'
  return undefined
}

function mapDecision(duration) {
  const value = String(duration ?? '').toUpperCase()
  if (value === 'REGULAR') return 'REG'
  if (value === 'EXTRA_TIME') return 'ET'
  if (value === 'PENALTY_SHOOTOUT') return 'PENS'
  return undefined
}

function deriveCodeFromName(name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed || /^TBD$/i.test(trimmed)) return 'TBD'
  const winnerMatch = trimmed.match(/Winner Group\s+([A-Z])/i)
  if (winnerMatch) return `W-${winnerMatch[1].toUpperCase()}`
  const runnerMatch = trimmed.match(/Runner[- ]?up Group\s+([A-Z])/i)
  if (runnerMatch) return `R-${runnerMatch[1].toUpperCase()}`
  const letters = trimmed.replace(/[^A-Za-z]/g, '')
  if (!letters) return 'TBD'
  return letters.slice(0, 3).toUpperCase()
}

function normalizeTeam(team) {
  const name = team?.name ?? 'TBD'
  const rawCode = team?.tla ?? team?.shortName ?? name
  const trimmed = String(rawCode ?? '').trim()
  const code =
    trimmed && /^[A-Za-z]{3}$/.test(trimmed) ? trimmed.toUpperCase() : deriveCodeFromName(name)
  return { code, name }
}

function normalizeScore(score) {
  const home = score?.fullTime?.home
  const away = score?.fullTime?.away
  if (!Number.isFinite(home) || !Number.isFinite(away)) return undefined
  return { home, away }
}

function normalizeMatch(match) {
  const stage = mapStage(match.stage)
  const status = mapStatus(match.status)
  const normalized = {
    id: String(match.id),
    stage,
    kickoffUtc: match.utcDate,
    status,
    homeTeam: normalizeTeam(match.homeTeam),
    awayTeam: normalizeTeam(match.awayTeam)
  }

  if (status === 'FINISHED') {
    const score = normalizeScore(match.score)
    if (score) normalized.score = score
    if (stage !== 'Group') {
      const winner = mapWinner(match.score?.winner)
      const decidedBy = mapDecision(match.score?.duration)
      if (winner) normalized.winner = winner
      if (decidedBy) normalized.decidedBy = decidedBy
    }
  }

  return normalized
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN
  if (!token) {
    throw new Error('FOOTBALL_DATA_TOKEN is not set.')
  }

  const response = await fetch(API_URL, {
    headers: { 'X-Auth-Token': token }
  })

  if (!response.ok) {
    throw new Error(`Football-data request failed (${response.status} ${response.statusText}).`)
  }

  const payload = await response.json()
  if (!payload || !Array.isArray(payload.matches)) {
    throw new Error('Unexpected API response.')
  }

  const matches = payload.matches.map(normalizeMatch)
  const output = {
    lastUpdated: new Date().toISOString(),
    matches
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`Updated ${matches.length} matches.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
