import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { combineBracketPredictions } from '../src/lib/bracket'
import { GROUP_OUTCOMES_LOCK_OFFSET_MINUTES, PACIFIC_TIME_ZONE } from '../src/lib/matches'
import { flattenPicksFile } from '../src/lib/picks'
import { buildLeaderboard } from '../src/lib/scoring'
import type { BracketGroupDoc, BracketKnockoutDoc, BracketPredictionsFile } from '../src/types/bracket'
import type { LeaderboardFile } from '../src/types/leaderboard'
import type { Match, MatchStage, MatchStatus, MatchesFile } from '../src/types/matches'
import type { Member, MembersFile } from '../src/types/members'
import type { Pick, PicksFile } from '../src/types/picks'
import type { BestThirdQualifiersFile } from '../src/types/qualifiers'
import type { ScoringConfig } from '../src/types/scoring'

type SimulatedBestThirdQualifiersFile = BestThirdQualifiersFile & {
  qualifiers_hint?: string[]
}

type ScenarioId =
  | 'pre-group'
  | 'mid-group'
  | 'end-group-draw-confirmed'
  | 'mid-knockout'
  | 'world-cup-final-pending'

type ScenarioConfig = {
  id: ScenarioId
  label: string
  groupFinishedRatio: number
  groupInPlayCount: number
  knockoutFinishedRatio: number
  knockoutInPlayCount: number
  allowKnockoutPredictions: boolean
  nowOffsetMinutes: number
  knockoutStageOverrides?: Partial<Record<Exclude<MatchStage, 'Group'>, { finishedRatio: number; inPlayCount: number }>>
}

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

type QualifierGroupId = 'A' | 'B' | 'D' | 'F' | 'I' | 'K'

type TeamSeed = {
  code: string
  name: string
}

type DemoCompletionProfile = {
  picksGlobalMultiplier: number
  picksHighActivityRatio: number
  picksLowActivityMultiplier: number
  groupCompleteRatio: number
  groupPartialMin: number
  groupPartialMax: number
  bestThirdPartialMin: number
  bestThirdPartialMax: number
  knockoutUserRatio: number
  knockoutPickChance: number
}

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'public', 'data')
const DEMO_DIR = path.join(DATA_DIR, 'demo')
const DEMO_SCENARIOS_DIR = path.join(DEMO_DIR, 'scenarios')
const MATCH_TIME_SLOTS: Array<{ hour: number; minute: number }> = [
  { hour: 9, minute: 30 },
  { hour: 12, minute: 0 },
  { hour: 15, minute: 30 },
  { hour: 19, minute: 0 }
]
const STAGE_ORDER: MatchStage[] = ['Group', 'R32', 'R16', 'QF', 'SF', 'Third', 'Final']
const GROUP_STAGE: ScenarioConfig = {
  id: 'pre-group',
  label: 'Pre group stage',
  groupFinishedRatio: 0,
  groupInPlayCount: 0,
  knockoutFinishedRatio: 0,
  knockoutInPlayCount: 0,
  allowKnockoutPredictions: false,
  nowOffsetMinutes: 0
}
const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  'pre-group': GROUP_STAGE,
  'mid-group': {
    id: 'mid-group',
    label: 'Mid group stage',
    groupFinishedRatio: 0.5,
    groupInPlayCount: 2,
    knockoutFinishedRatio: 0,
    knockoutInPlayCount: 0,
    allowKnockoutPredictions: false,
    nowOffsetMinutes: 0
  },
  'end-group-draw-confirmed': {
    id: 'end-group-draw-confirmed',
    label: 'End group stage and knockout draw confirmed',
    groupFinishedRatio: 1,
    groupInPlayCount: 0,
    knockoutFinishedRatio: 0,
    knockoutInPlayCount: 0,
    allowKnockoutPredictions: true,
    nowOffsetMinutes: GROUP_OUTCOMES_LOCK_OFFSET_MINUTES + 15
  },
  'mid-knockout': {
    id: 'mid-knockout',
    label: 'Mid knockout phase',
    groupFinishedRatio: 1,
    groupInPlayCount: 0,
    knockoutFinishedRatio: 0.45,
    knockoutInPlayCount: 2,
    allowKnockoutPredictions: true,
    nowOffsetMinutes: 0
  },
  'world-cup-final-pending': {
    id: 'world-cup-final-pending',
    label: 'World Cup final pending',
    groupFinishedRatio: 1,
    groupInPlayCount: 0,
    knockoutFinishedRatio: 1,
    knockoutInPlayCount: 0,
    allowKnockoutPredictions: true,
    nowOffsetMinutes: 0,
    knockoutStageOverrides: {
      R32: { finishedRatio: 1, inPlayCount: 0 },
      R16: { finishedRatio: 1, inPlayCount: 0 },
      QF: { finishedRatio: 1, inPlayCount: 0 },
      SF: { finishedRatio: 1, inPlayCount: 0 },
      Third: { finishedRatio: 1, inPlayCount: 0 },
      Final: { finishedRatio: 0, inPlayCount: 0 }
    }
  }
}

const QUALIFIER_PLACEHOLDER_BY_GROUP: Record<QualifierGroupId, string> = {
  A: 'A1',
  B: 'B1',
  D: 'D1',
  F: 'F1',
  I: 'I1',
  K: 'K1'
}

const QUALIFIER_CANDIDATES_BY_GROUP: Record<QualifierGroupId, TeamSeed[]> = {
  A: [
    { code: 'DEN', name: 'Denmark' },
    { code: 'MKD', name: 'North Macedonia' },
    { code: 'CZE', name: 'Czechia' },
    { code: 'IRL', name: 'Republic of Ireland' }
  ],
  B: [
    { code: 'ITA', name: 'Italy' },
    { code: 'NIR', name: 'Northern Ireland' },
    { code: 'WAL', name: 'Wales' },
    { code: 'BIH', name: 'Bosnia and Herzegovina' }
  ],
  D: [
    { code: 'TUR', name: 'Turkey' },
    { code: 'ROU', name: 'Romania' },
    { code: 'SVK', name: 'Slovakia' },
    { code: 'KOS', name: 'Kosovo' }
  ],
  F: [
    { code: 'UKR', name: 'Ukraine' },
    { code: 'SWE', name: 'Sweden' },
    { code: 'POL', name: 'Poland' },
    { code: 'ALB', name: 'Albania' }
  ],
  I: [
    { code: 'IRQ', name: 'Iraq' },
    { code: 'BOL', name: 'Bolivia' },
    { code: 'SUR', name: 'Suriname' }
  ],
  K: [
    { code: 'COD', name: 'DR Congo' },
    { code: 'JAM', name: 'Jamaica' },
    { code: 'NCL', name: 'New Caledonia' }
  ]
}

const FAVORITE_TEAM_POOL = [
  'ARG',
  'BRA',
  'ENG',
  'FRA',
  'GER',
  'ESP',
  'USA',
  'MEX',
  'JPN',
  'KOR',
  'DEN',
  'ITA',
  'TUR',
  'UKR',
  'SWE',
  'POL',
  'IRQ',
  'COD',
  'JAM',
  'NIR',
  'WAL',
  'IRL'
] as const

const SCENARIO_COMPLETION_PROFILE: Record<ScenarioId, DemoCompletionProfile> = {
  'pre-group': {
    picksGlobalMultiplier: 0.45,
    picksHighActivityRatio: 0.2,
    picksLowActivityMultiplier: 0.35,
    groupCompleteRatio: 0.18,
    groupPartialMin: 1,
    groupPartialMax: 4,
    bestThirdPartialMin: 2,
    bestThirdPartialMax: 4,
    knockoutUserRatio: 0,
    knockoutPickChance: 0
  },
  'mid-group': {
    picksGlobalMultiplier: 0.78,
    picksHighActivityRatio: 0.55,
    picksLowActivityMultiplier: 0.7,
    groupCompleteRatio: 0.55,
    groupPartialMin: 5,
    groupPartialMax: 9,
    bestThirdPartialMin: 6,
    bestThirdPartialMax: 8,
    knockoutUserRatio: 0,
    knockoutPickChance: 0
  },
  'end-group-draw-confirmed': {
    picksGlobalMultiplier: 0.94,
    picksHighActivityRatio: 0.86,
    picksLowActivityMultiplier: 0.82,
    groupCompleteRatio: 0.86,
    groupPartialMin: 9,
    groupPartialMax: 11,
    bestThirdPartialMin: 8,
    bestThirdPartialMax: 8,
    knockoutUserRatio: 0.82,
    knockoutPickChance: 0.82
  },
  'mid-knockout': {
    picksGlobalMultiplier: 0.97,
    picksHighActivityRatio: 0.93,
    picksLowActivityMultiplier: 0.9,
    groupCompleteRatio: 0.93,
    groupPartialMin: 10,
    groupPartialMax: 12,
    bestThirdPartialMin: 8,
    bestThirdPartialMax: 8,
    knockoutUserRatio: 0.92,
    knockoutPickChance: 0.92
  },
  'world-cup-final-pending': {
    picksGlobalMultiplier: 0.995,
    picksHighActivityRatio: 0.98,
    picksLowActivityMultiplier: 0.95,
    groupCompleteRatio: 0.98,
    groupPartialMin: 11,
    groupPartialMax: 12,
    bestThirdPartialMin: 8,
    bestThirdPartialMax: 8,
    knockoutUserRatio: 0.98,
    knockoutPickChance: 0.97
  }
}

function parseArgs() {
  const defaults = {
    scenario: GROUP_STAGE.id as ScenarioId,
    users: 50,
    seed: Date.now() % 2_147_483_647
  }
  const parsed = { ...defaults }

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--')) continue
    const [rawKey, rawValue] = arg.slice(2).split('=')
    const key = rawKey.trim()
    const value = (rawValue ?? '').trim()

    if (key === 'scenario' && value in SCENARIOS) {
      parsed.scenario = value as ScenarioId
      continue
    }
    if (key === 'users' && Number.isFinite(Number(value))) {
      parsed.users = Math.max(1, Math.floor(Number(value)))
      continue
    }
    if (key === 'seed' && Number.isFinite(Number(value))) {
      parsed.seed = Math.floor(Number(value))
    }
  }

  return parsed
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return function random() {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function choice<T>(random: () => number, values: T[]): T {
  const index = Math.min(values.length - 1, Math.floor(random() * values.length))
  return values[index]
}

function shuffle<T>(random: () => number, values: T[]): T[] {
  const next = [...values]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

function hashUnit(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function deterministicCountFromRange(
  min: number,
  max: number,
  key: string
): number {
  if (max <= min) return min
  const unit = hashUnit(key)
  return min + Math.floor(unit * (max - min + 1))
}

function userCompletionBucket(userId: string, scenarioId: ScenarioId): number {
  return hashUnit(`completion:${scenarioId}:${userId}`)
}

function parseUserOrdinal(userId: string): number {
  const match = userId.match(/^user-(\d+)$/i)
  if (!match) return 1
  const parsed = Number(match[1])
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function resolveFavoriteTeamCode(userId: string): string {
  const userOrdinal = parseUserOrdinal(userId)
  return FAVORITE_TEAM_POOL[(userOrdinal - 1) % FAVORITE_TEAM_POOL.length]!
}

function normalizeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function isPlaceholderTeamCode(code: string | null | undefined): boolean {
  const normalized = normalizeCode(code)
  if (!normalized) return true
  if (normalized === 'TBD' || normalized === 'TBC' || normalized === '?') return true
  if (/^[A-L][1-4]$/.test(normalized)) return true
  if (/^BT\d+$/.test(normalized)) return true
  if (/^Q\d+$/.test(normalized)) return true
  return false
}

function isMatchTeamsResolved(match: Match): boolean {
  return !isPlaceholderTeamCode(match.homeTeam.code) && !isPlaceholderTeamCode(match.awayTeam.code)
}

function pickQualifierWinners(random: () => number): Record<QualifierGroupId, TeamSeed> {
  const selected = {} as Record<QualifierGroupId, TeamSeed>
  for (const groupId of Object.keys(QUALIFIER_CANDIDATES_BY_GROUP) as QualifierGroupId[]) {
    const candidates = QUALIFIER_CANDIDATES_BY_GROUP[groupId]
    selected[groupId] = choice(random, candidates)
  }
  return selected
}

function isQualifierPlaceholderTeam(
  team: { code: string; name: string },
  expectedPlaceholderCode: string
): boolean {
  const normalizedCode = normalizeCode(team.code)
  if (normalizedCode === expectedPlaceholderCode) return true
  if (isPlaceholderTeamCode(normalizedCode)) return true

  const normalizedName = String(team.name ?? '').trim().toLowerCase()
  if (!normalizedName) return false
  if (normalizedName === 'to be decided') return true
  if (/^(winner|loser)\s+of\b/i.test(normalizedName)) return true
  if (normalizedName.includes('playoff') || normalizedName.includes('path')) return true
  return false
}

function applyQualifierWinners(
  matches: Match[],
  selectedQualifiersByGroup: Record<QualifierGroupId, TeamSeed>
): Match[] {
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const groupId = (match.group ?? '').trim().toUpperCase() as QualifierGroupId
    const selected = selectedQualifiersByGroup[groupId]
    if (!selected) continue
    const placeholderCode = QUALIFIER_PLACEHOLDER_BY_GROUP[groupId]

    if (isQualifierPlaceholderTeam(match.homeTeam, placeholderCode)) {
      match.homeTeam = { code: selected.code, name: selected.name }
    }
    if (isQualifierPlaceholderTeam(match.awayTeam, placeholderCode)) {
      match.awayTeam = { code: selected.code, name: selected.name }
    }
  }
  return matches
}

async function readJson<T>(dir: string, file: string): Promise<T> {
  const raw = await fs.readFile(path.join(dir, file), 'utf8')
  return JSON.parse(raw) as T
}

async function writeJson(dir: string, file: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`)
}

function getTimeZoneParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(date)
  const lookup: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  }
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone)
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return utcTime - date.getTime()
}

function makeDateInTimeZone(parts: DateParts, timeZone: string): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const guessDate = new Date(utcGuess)
  const offset = getTimeZoneOffset(guessDate, timeZone)
  return new Date(utcGuess - offset)
}

function addDaysInTimeZone(parts: DateParts, deltaDays: number, timeZone: string): DateParts {
  const noon = makeDateInTimeZone(
    { ...parts, hour: 12, minute: 0, second: 0 },
    timeZone
  )
  const shifted = new Date(noon.getTime() + deltaDays * 24 * 60 * 60 * 1000)
  return getTimeZoneParts(shifted, timeZone)
}

function toPacificIso(base: Date, dayOffset: number, hour: number, minute: number): string {
  const baseParts = getTimeZoneParts(base, PACIFIC_TIME_ZONE)
  const targetDay = addDaysInTimeZone(baseParts, dayOffset, PACIFIC_TIME_ZONE)
  const target = makeDateInTimeZone(
    {
      year: targetDay.year,
      month: targetDay.month,
      day: targetDay.day,
      hour,
      minute,
      second: 0
    },
    PACIFIC_TIME_ZONE
  )
  return target.toISOString()
}

function getStageIndex(stage: MatchStage): number {
  return STAGE_ORDER.indexOf(stage)
}

function randomGroupScore(random: () => number) {
  const home = Math.floor(random() * 5)
  const away = Math.floor(random() * 5)
  return { home, away }
}

function randomKnockoutScore(random: () => number) {
  const tie = random() < 0.25
  if (tie) {
    const score = Math.floor(random() * 4)
    return {
      home: score,
      away: score,
      decidedBy: choice(random, ['ET', 'PENS'] as const),
      winner: choice(random, ['HOME', 'AWAY'] as const)
    }
  }
  const home = Math.floor(random() * 4)
  const away = Math.floor(random() * 4)
  if (home === away) {
    return {
      home,
      away: away + 1,
      decidedBy: 'REG' as const,
      winner: 'AWAY' as const
    }
  }
  return {
    home,
    away,
    decidedBy: 'REG' as const,
    winner: home > away ? ('HOME' as const) : ('AWAY' as const)
  }
}

function toMatchStatus(index: number, total: number, finishedRatio: number, inPlayCount: number): MatchStatus {
  const finishedCount = Math.max(0, Math.min(total, Math.floor(total * finishedRatio)))
  if (index < finishedCount) return 'FINISHED'
  if (index < finishedCount + inPlayCount) return 'IN_PLAY'
  return 'SCHEDULED'
}

function assignScenarioMatches(
  random: () => number,
  matchesFile: MatchesFile,
  scenario: ScenarioConfig
): { matchesFile: MatchesFile; scenarioNowUtc: string } {
  const now = new Date()
  const scenarioNowUtc = new Date(now.getTime() + scenario.nowOffsetMinutes * 60 * 1000).toISOString()
  const scenarioNowPacific = getTimeZoneParts(new Date(scenarioNowUtc), PACIFIC_TIME_ZONE)

  const groupedByStage = new Map<MatchStage, Match[]>()
  for (const stage of STAGE_ORDER) groupedByStage.set(stage, [])
  for (const match of matchesFile.matches) {
    const list = groupedByStage.get(match.stage) ?? []
    list.push(match)
    groupedByStage.set(match.stage, list)
  }

  for (const stage of STAGE_ORDER) {
    const list = groupedByStage.get(stage) ?? []
    list.sort((a, b) => {
      const byKickoff = new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
      if (byKickoff !== 0) return byKickoff
      return a.id.localeCompare(b.id)
    })
  }

  const scenarioNow = new Date(scenarioNowUtc)
  const updatedMatches: Match[] = []

  for (const stage of STAGE_ORDER) {
    const list = groupedByStage.get(stage) ?? []
    if (list.length === 0) continue

    const stageIndex = getStageIndex(stage)
    const isGroupStage = stage === 'Group'
    const knockoutOverride = !isGroupStage ? scenario.knockoutStageOverrides?.[stage] : undefined
    const finishedRatio = isGroupStage
      ? scenario.groupFinishedRatio
      : knockoutOverride?.finishedRatio ?? scenario.knockoutFinishedRatio
    const inPlayCount = isGroupStage
      ? scenario.groupInPlayCount
      : knockoutOverride?.inPlayCount ?? scenario.knockoutInPlayCount

    for (let index = 0; index < list.length; index += 1) {
      const match = list[index]
      const slot = MATCH_TIME_SLOTS[index % MATCH_TIME_SLOTS.length]
      const dayBucket = Math.floor(index / MATCH_TIME_SLOTS.length)
      const status = toMatchStatus(index, list.length, finishedRatio, inPlayCount)

      let dayOffset = 2 + stageIndex * 3 + dayBucket
      if (status === 'FINISHED') dayOffset = -6 - (stageIndex * 2) + dayBucket
      if (status === 'IN_PLAY') dayOffset = 0

      const kickoffUtc = toPacificIso(
        scenarioNow,
        dayOffset,
        status === 'IN_PLAY' ? scenarioNowPacific.hour : slot.hour,
        status === 'IN_PLAY' ? scenarioNowPacific.minute : slot.minute
      )

      const nextMatch: Match = {
        ...match,
        kickoffUtc,
        status
      }

      if (status === 'SCHEDULED') {
        delete nextMatch.score
        delete nextMatch.winner
        delete nextMatch.decidedBy
      } else if (status === 'IN_PLAY') {
        const live = isGroupStage ? randomGroupScore(random) : randomKnockoutScore(random)
        nextMatch.score = { home: Math.min(4, live.home), away: Math.min(4, live.away) }
        if (isGroupStage) {
          delete nextMatch.winner
          delete nextMatch.decidedBy
        } else {
          nextMatch.winner = live.winner
          nextMatch.decidedBy = live.decidedBy
        }
      } else {
        if (isGroupStage) {
          nextMatch.score = randomGroupScore(random)
          delete nextMatch.winner
          delete nextMatch.decidedBy
        } else {
          const finished = randomKnockoutScore(random)
          nextMatch.score = { home: finished.home, away: finished.away }
          nextMatch.winner = finished.winner
          nextMatch.decidedBy = finished.decidedBy
        }
      }

      updatedMatches.push(nextMatch)
    }
  }

  updatedMatches.sort((a, b) => {
    const byStage = getStageIndex(a.stage) - getStageIndex(b.stage)
    if (byStage !== 0) return byStage
    const byKickoff = new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    if (byKickoff !== 0) return byKickoff
    return a.id.localeCompare(b.id)
  })

  return {
    matchesFile: {
      lastUpdated: scenarioNowUtc,
      matches: updatedMatches
    },
    scenarioNowUtc
  }
}

function createMembers(totalUsers: number): MembersFile {
  const members: Member[] = []
  for (let index = 1; index <= totalUsers; index += 1) {
    const id = `user-${index}`
    members.push({
      id,
      name: `Demo Player ${String(index).padStart(2, '0')}`,
      email: `${id}@demo.local`,
      isAdmin: index === 1,
      isMember: true,
      favoriteTeamCode: resolveFavoriteTeamCode(id)
    })
  }
  return { members }
}

function buildGroupTeamMap(matches: Match[]): Map<string, string[]> {
  const groupTeams = new Map<string, Set<string>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teams = groupTeams.get(match.group) ?? new Set<string>()
    const homeCode = normalizeCode(match.homeTeam.code)
    const awayCode = normalizeCode(match.awayTeam.code)
    if (!isPlaceholderTeamCode(homeCode)) teams.add(homeCode)
    if (!isPlaceholderTeamCode(awayCode)) teams.add(awayCode)
    groupTeams.set(match.group, teams)
  }
  const result = new Map<string, string[]>()
  for (const [groupId, teams] of groupTeams.entries()) {
    result.set(groupId, [...teams.values()].sort((a, b) => a.localeCompare(b)))
  }
  return result
}

type GroupStandingRow = {
  code: string
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
}

function computeGroupStandings(matches: Match[]): Map<string, GroupStandingRow[]> {
  const rows = new Map<string, Map<string, GroupStandingRow>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group || !match.score) continue
    const groupRows = rows.get(match.group) ?? new Map<string, GroupStandingRow>()
    const home = groupRows.get(match.homeTeam.code) ?? {
      code: match.homeTeam.code,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0
    }
    const away = groupRows.get(match.awayTeam.code) ?? {
      code: match.awayTeam.code,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0
    }

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

    groupRows.set(home.code, home)
    groupRows.set(away.code, away)
    rows.set(match.group, groupRows)
  }

  const standings = new Map<string, GroupStandingRow[]>()
  for (const [groupId, groupRows] of rows.entries()) {
    const sorted = [...groupRows.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
      return a.code.localeCompare(b.code)
    })
    standings.set(groupId, sorted)
  }
  return standings
}

function buildTeamNameMap(matches: Match[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const match of matches) {
    const homeCode = normalizeCode(match.homeTeam.code)
    const awayCode = normalizeCode(match.awayTeam.code)
    if (!isPlaceholderTeamCode(homeCode)) names.set(homeCode, match.homeTeam.name)
    if (!isPlaceholderTeamCode(awayCode)) names.set(awayCode, match.awayTeam.name)
  }
  return names
}

function normalizeGroupStageTeams(random: () => number, matches: Match[]): Match[] {
  const globalFallbackCodes = [
    ...new Set(
      matches
        .flatMap((match) => [match.homeTeam.code, match.awayTeam.code])
        .map((code) => normalizeCode(code))
        .filter((code) => !isPlaceholderTeamCode(code))
    )
  ]

  const byGroup = new Map<string, Match[]>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const list = byGroup.get(match.group) ?? []
    list.push(match)
    byGroup.set(match.group, list)
  }

  for (const [groupId, groupMatches] of byGroup.entries()) {
    groupMatches.sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
    const knownCodes = new Set<string>()
    const knownNames = new Map<string, string>()
    for (const match of groupMatches) {
      const homeCode = normalizeCode(match.homeTeam.code)
      const awayCode = normalizeCode(match.awayTeam.code)
      if (!isPlaceholderTeamCode(homeCode)) {
        knownCodes.add(homeCode)
        knownNames.set(homeCode, match.homeTeam.name)
      }
      if (!isPlaceholderTeamCode(awayCode)) {
        knownCodes.add(awayCode)
        knownNames.set(awayCode, match.awayTeam.name)
      }
    }

    const pool = [...knownCodes]
    const qualifierCandidates = shuffle(
      random,
      QUALIFIER_CANDIDATES_BY_GROUP[groupId as QualifierGroupId] ?? []
    )
    for (const candidate of qualifierCandidates) {
      if (pool.length >= 4) break
      if (pool.includes(candidate.code)) continue
      pool.push(candidate.code)
      knownNames.set(candidate.code, candidate.name)
    }

    const fallbackPool = shuffle(random, globalFallbackCodes)
    while (pool.length < 4) {
      const candidate = fallbackPool.find((code) => !pool.includes(code))
      if (!candidate) break
      pool.push(candidate)
    }
    const teams = shuffle(random, pool).slice(0, 4)
    const pairs: Array<[number, number]> = [
      [0, 1],
      [2, 3],
      [0, 2],
      [1, 3],
      [0, 3],
      [1, 2]
    ]
    for (let index = 0; index < groupMatches.length; index += 1) {
      const match = groupMatches[index]
      const [homeIndex, awayIndex] = pairs[index % pairs.length]
      const homeCode = teams[homeIndex]
      const awayCode = teams[awayIndex]
      match.homeTeam = {
        code: homeCode,
        name: knownNames.get(homeCode) ?? `Group ${groupId} Team ${homeCode}`
      }
      match.awayTeam = {
        code: awayCode,
        name: knownNames.get(awayCode) ?? `Group ${groupId} Team ${awayCode}`
      }
    }
  }

  return matches
}

function resolveQualifiedTeams(
  random: () => number,
  matches: Match[],
  bestThirds: string[]
): string[] {
  const standings = computeGroupStandings(matches)
  const qualified: string[] = []
  for (const rows of standings.values()) {
    if (rows[0]?.code) qualified.push(rows[0].code)
    if (rows[1]?.code) qualified.push(rows[1].code)
  }
  for (const code of bestThirds) {
    if (!qualified.includes(code)) qualified.push(code)
  }

  const fallbackPool = [...new Set(matches
    .filter((match) => match.stage === 'Group')
    .flatMap((match) => [match.homeTeam.code, match.awayTeam.code])
    .map((code) => normalizeCode(code))
    .filter((code) => !isPlaceholderTeamCode(code)))]

  for (const code of shuffle(random, fallbackPool)) {
    if (qualified.length >= 32) break
    if (!qualified.includes(code)) qualified.push(code)
  }

  let syntheticIndex = 1
  while (qualified.length < 32) {
    const synthetic = `Q${syntheticIndex}`
    if (!qualified.includes(synthetic)) qualified.push(synthetic)
    syntheticIndex += 1
  }

  return shuffle(random, qualified).slice(0, 32)
}

function setTeam(match: Match, side: 'home' | 'away', code: string, names: Map<string, string>) {
  const normalizedCode = normalizeCode(code)
  const resolvedCode = isPlaceholderTeamCode(normalizedCode) ? 'TBD' : normalizedCode
  const name = resolvedCode === 'TBD' ? 'To be decided' : names.get(resolvedCode) ?? resolvedCode
  if (side === 'home') {
    match.homeTeam = { code: resolvedCode, name }
  } else {
    match.awayTeam = { code: resolvedCode, name }
  }
}

function winnerCode(match: Match): string | null {
  if (match.status !== 'FINISHED') return null
  if (!match.winner) return null
  const winnerTeamCode = match.winner === 'HOME' ? match.homeTeam.code : match.awayTeam.code
  const normalizedWinnerCode = normalizeCode(winnerTeamCode)
  return isPlaceholderTeamCode(normalizedWinnerCode) ? null : normalizedWinnerCode
}

function loserCode(match: Match): string | null {
  if (match.status !== 'FINISHED') return null
  if (!match.winner) return null
  const loserTeamCode = match.winner === 'HOME' ? match.awayTeam.code : match.homeTeam.code
  const normalizedLoserCode = normalizeCode(loserTeamCode)
  return isPlaceholderTeamCode(normalizedLoserCode) ? null : normalizedLoserCode
}

function hasResolvedKnockoutTeams(match: Match): boolean {
  return isMatchTeamsResolved(match)
}

function clearKnockoutResult(match: Match): void {
  delete match.score
  delete match.winner
  delete match.decidedBy
}

function applyKnockoutDrawAndProgression(
  random: () => number,
  matches: Match[],
  bestThirds: string[],
  scenario: ScenarioConfig
): Match[] {
  if (!scenario.allowKnockoutPredictions) return matches
  const names = buildTeamNameMap(matches)
  const qualifiedTeams = resolveQualifiedTeams(random, matches, bestThirds)
  const byStage = new Map<Exclude<MatchStage, 'Group'>, Match[]>()
  for (const stage of ['R32', 'R16', 'QF', 'SF', 'Third', 'Final'] as const) {
    const stageMatches = matches
      .filter((match) => match.stage === stage)
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
    byStage.set(stage, stageMatches)
  }

  const r32 = byStage.get('R32') ?? []
  for (let index = 0; index < r32.length; index += 1) {
    const home = qualifiedTeams[index * 2] ?? 'TBD'
    const away = qualifiedTeams[index * 2 + 1] ?? 'TBD'
    setTeam(r32[index], 'home', home, names)
    setTeam(r32[index], 'away', away, names)
  }

  const r16 = byStage.get('R16') ?? []
  for (let index = 0; index < r16.length; index += 1) {
    const sourceA = r32[index * 2]
    const sourceB = r32[index * 2 + 1]
    setTeam(r16[index], 'home', sourceA ? (winnerCode(sourceA) ?? 'TBD') : 'TBD', names)
    setTeam(r16[index], 'away', sourceB ? (winnerCode(sourceB) ?? 'TBD') : 'TBD', names)
  }

  const qf = byStage.get('QF') ?? []
  for (let index = 0; index < qf.length; index += 1) {
    const sourceA = r16[index * 2]
    const sourceB = r16[index * 2 + 1]
    setTeam(qf[index], 'home', sourceA ? (winnerCode(sourceA) ?? 'TBD') : 'TBD', names)
    setTeam(qf[index], 'away', sourceB ? (winnerCode(sourceB) ?? 'TBD') : 'TBD', names)
  }

  const sf = byStage.get('SF') ?? []
  for (let index = 0; index < sf.length; index += 1) {
    const sourceA = qf[index * 2]
    const sourceB = qf[index * 2 + 1]
    setTeam(sf[index], 'home', sourceA ? (winnerCode(sourceA) ?? 'TBD') : 'TBD', names)
    setTeam(sf[index], 'away', sourceB ? (winnerCode(sourceB) ?? 'TBD') : 'TBD', names)
  }

  const third = byStage.get('Third') ?? []
  if (third[0]) {
    setTeam(third[0], 'home', sf[0] ? (loserCode(sf[0]) ?? 'TBD') : 'TBD', names)
    setTeam(third[0], 'away', sf[1] ? (loserCode(sf[1]) ?? 'TBD') : 'TBD', names)
  }

  const final = byStage.get('Final') ?? []
  if (final[0]) {
    setTeam(final[0], 'home', sf[0] ? (winnerCode(sf[0]) ?? 'TBD') : 'TBD', names)
    setTeam(final[0], 'away', sf[1] ? (winnerCode(sf[1]) ?? 'TBD') : 'TBD', names)
  }

  for (const stage of ['R32', 'R16', 'QF', 'SF', 'Third', 'Final'] as const) {
    const stageMatches = byStage.get(stage) ?? []
    for (const match of stageMatches) {
      if (!hasResolvedKnockoutTeams(match)) {
        match.status = 'SCHEDULED'
        clearKnockoutResult(match)
        continue
      }

      if (match.status === 'IN_PLAY') {
        // Keep live score, but winner/decider should not be finalized mid-match.
        delete match.winner
        delete match.decidedBy
      }
    }
  }

  return matches
}

function generateGroupDoc(
  random: () => number,
  userId: string,
  groupTeamMap: Map<string, string[]>,
  updatedAt: string,
  scenario: ScenarioConfig,
  completionProfile: DemoCompletionProfile,
  standingsByGroup: Map<string, GroupStandingRow[]>
): BracketGroupDoc {
  const groups: Record<string, { first?: string; second?: string }> = {}
  const bestThirdCandidates: Array<string> = []

  const groupIds = [...groupTeamMap.keys()].sort((a, b) => a.localeCompare(b))
  const completionBucket = userCompletionBucket(userId, scenario.id)
  const completeGroups = completionBucket <= completionProfile.groupCompleteRatio
  const partialGroupsTarget = deterministicCountFromRange(
    completionProfile.groupPartialMin,
    completionProfile.groupPartialMax,
    `group:${scenario.id}:${userId}`
  )
  const selectedGroupCount = clamp(
    completeGroups ? groupIds.length : partialGroupsTarget,
    0,
    groupIds.length
  )
  const selectedGroupIds = new Set(shuffle(random, groupIds).slice(0, selectedGroupCount))

  for (const groupId of groupIds) {
    const teams = (groupTeamMap.get(groupId) ?? []).filter((code) => !isPlaceholderTeamCode(code))
    if (teams.length < 2) continue
    const shuffled = shuffle(random, teams)
    const first = shuffled[0]
    const second = shuffled.find((code) => code !== first)

    if (selectedGroupIds.has(groupId)) {
      groups[groupId] = {
        first,
        second
      }
    }

    const selectedTopTwo = groups[groupId]
    const excludedTopTwo = new Set(
      [selectedTopTwo?.first, selectedTopTwo?.second].filter((value): value is string => Boolean(value))
    )
    const standingsCodes = (standingsByGroup.get(groupId) ?? []).map((row) => row.code)
    const candidateFromStandings = standingsCodes.find((code) => !excludedTopTwo.has(code))
    const candidateFromPool = shuffled.find((code) => !excludedTopTwo.has(code))
    const bestThirdCandidate = candidateFromStandings ?? candidateFromPool
    if (bestThirdCandidate) bestThirdCandidates.push(bestThirdCandidate)
  }

  const completeBestThirds = completionBucket <= completionProfile.groupCompleteRatio
  const partialBestThirdTarget = deterministicCountFromRange(
    completionProfile.bestThirdPartialMin,
    completionProfile.bestThirdPartialMax,
    `best-third:${scenario.id}:${userId}`
  )
  const selectedBestThirdCount = clamp(
    completeBestThirds ? 8 : partialBestThirdTarget,
    0,
    Math.min(8, bestThirdCandidates.length)
  )
  const bestThirds = shuffle(random, bestThirdCandidates).slice(0, selectedBestThirdCount)

  return {
    userId,
    groups,
    bestThirds,
    updatedAt
  }
}

function generateKnockoutDoc(
  random: () => number,
  userId: string,
  matches: Match[],
  updatedAt: string,
  scenario: ScenarioConfig,
  completionProfile: DemoCompletionProfile
): BracketKnockoutDoc {
  const byStage: Partial<Record<Exclude<MatchStage, 'Group'>, Record<string, 'HOME' | 'AWAY'>>> = {}

  if (!scenario.allowKnockoutPredictions) {
    return { userId, knockout: {}, updatedAt }
  }

  const completionBucket = userCompletionBucket(userId, scenario.id)
  if (completionBucket > completionProfile.knockoutUserRatio) {
    return { userId, knockout: {}, updatedAt }
  }

  for (const match of matches) {
    if (match.stage === 'Group') continue
    if (!isMatchTeamsResolved(match)) continue
    const pickChance = clamp(
      completionProfile.knockoutPickChance * (match.status === 'SCHEDULED' ? 0.95 : 1),
      0,
      0.995
    )
    if (random() > pickChance) continue
    const stage = match.stage
    const stagePicks = byStage[stage] ?? {}
    stagePicks[match.id] = random() > 0.5 ? 'HOME' : 'AWAY'
    byStage[stage] = stagePicks
  }

  return {
    userId,
    knockout: byStage,
    updatedAt
  }
}

function makeMatchPick(random: () => number, match: Match): Pick {
  const id = `pick-${Math.floor(random() * 1_000_000_000)}`
  const createdAt = new Date().toISOString()
  let homeScore = Math.floor(random() * 5)
  let awayScore = Math.floor(random() * 5)
  let advances: 'HOME' | 'AWAY' | undefined

  if (match.stage !== 'Group' && random() < 0.2) {
    const tied = Math.floor(random() * 4)
    homeScore = tied
    awayScore = tied
    advances = random() < 0.5 ? 'HOME' : 'AWAY'
  } else if (match.stage !== 'Group' && homeScore === awayScore) {
    awayScore = (awayScore + 1) % 5
  }

  return {
    id,
    matchId: match.id,
    userId: '',
    homeScore,
    awayScore,
    advances,
    createdAt,
    updatedAt: createdAt
  }
}

function baseMatchPickChance(match: Match, scenarioNowUtc: string): number {
  const now = new Date(scenarioNowUtc).getTime()
  const lockTime = new Date(match.kickoffUtc).getTime() - 30 * 60 * 1000
  const isLocked = now >= lockTime

  if (match.stage === 'Group') {
    if (match.status === 'FINISHED') return 0.99
    if (match.status === 'IN_PLAY') return 0.97
    return isLocked ? 0.35 : 0.72
  }

  if (match.status === 'FINISHED') return 0.98
  if (match.status === 'IN_PLAY') return 0.94
  return isLocked ? 0.4 : 0.78
}

function generatePicksForUser(
  random: () => number,
  userId: string,
  matches: Match[],
  scenario: ScenarioConfig,
  scenarioNowUtc: string,
  completionProfile: DemoCompletionProfile
): PicksFile['picks'][number] {
  const picks: Pick[] = []
  const completionBucket = userCompletionBucket(userId, scenario.id)
  const isHighActivity = completionBucket <= completionProfile.picksHighActivityRatio
  const userPickMultiplier =
    completionProfile.picksGlobalMultiplier *
    (isHighActivity ? 1 : completionProfile.picksLowActivityMultiplier)

  for (const match of matches) {
    if (!isMatchTeamsResolved(match)) continue
    const pickChance = clamp(
      baseMatchPickChance(match, scenarioNowUtc) * userPickMultiplier,
      0,
      0.995
    )

    if (random() > pickChance) continue
    const pick = makeMatchPick(random, match)
    pick.userId = userId
    pick.id = `pick-${userId}-${match.id}`
    picks.push(pick)
  }

  return {
    userId,
    picks,
    updatedAt: new Date().toISOString()
  }
}

function buildBestThirdQualifiers(
  random: () => number,
  matches: Match[],
  scenario: ScenarioConfig
): SimulatedBestThirdQualifiersFile {
  const standings = computeGroupStandings(matches)
  const topTwoPool = new Set(
    [...standings.values()]
      .flatMap((rows) => [rows[0]?.code, rows[1]?.code])
      .filter((code): code is string => Boolean(code))
  )
  const thirdPlacePool = [...standings.values()]
    .map((rows) => rows[2]?.code)
    .filter((code): code is string => Boolean(code) && !topTwoPool.has(code))

  const fallbackPool = [...new Set(matches
    .filter((match) => match.stage === 'Group')
    .flatMap((match) => [match.homeTeam.code, match.awayTeam.code])
    .map((code) => normalizeCode(code))
    .filter((code) => !isPlaceholderTeamCode(code) && !topTwoPool.has(code)))]

  const pool = shuffle(random, [...thirdPlacePool, ...fallbackPool])
  const qualifiers = [...new Set(pool)].slice(0, 8)

  // Keep outputs UX-rich in all scenarios by providing 8 entries.
  let syntheticIndex = 1
  while (qualifiers.length < 8) {
    const synthetic = `BT${syntheticIndex}`
    if (!qualifiers.includes(synthetic)) qualifiers.push(synthetic)
    syntheticIndex += 1
  }

  return {
    updatedAt: new Date().toISOString(),
    qualifiers,
    qualifiers_hint: qualifiers
  }
}

async function run() {
  const args = parseArgs()
  const scenario = SCENARIOS[args.scenario]
  const completionProfile = SCENARIO_COMPLETION_PROFILE[scenario.id]
  const random = mulberry32(args.seed)

  const [baseMatches, scoring] = await Promise.all([
    readJson<MatchesFile>(DATA_DIR, 'matches.json'),
    readJson<ScoringConfig>(DATA_DIR, 'scoring.json')
  ])

  const { matchesFile: seededMatchesFile, scenarioNowUtc } = assignScenarioMatches(random, baseMatches, scenario)
  const selectedQualifiersByGroup = pickQualifierWinners(random)
  seededMatchesFile.matches = applyQualifierWinners(
    seededMatchesFile.matches,
    selectedQualifiersByGroup
  )
  seededMatchesFile.matches = normalizeGroupStageTeams(random, seededMatchesFile.matches)
  const bestThirdFile = buildBestThirdQualifiers(random, seededMatchesFile.matches, scenario)
  const matchesFile: MatchesFile = {
    ...seededMatchesFile,
    matches: applyKnockoutDrawAndProgression(
      random,
      seededMatchesFile.matches,
      bestThirdFile.qualifiers,
      scenario
    )
  }
  const membersFile = createMembers(args.users)

  const picksFile: PicksFile = {
    picks: membersFile.members.map((member) =>
      generatePicksForUser(
        random,
        member.id,
        matchesFile.matches,
        scenario,
        scenarioNowUtc,
        completionProfile
      )
    )
  }

  const groupTeamMap = buildGroupTeamMap(matchesFile.matches)
  const standingsByGroup = computeGroupStandings(matchesFile.matches)
  const groupDocs: BracketGroupDoc[] = membersFile.members.map((member) =>
    generateGroupDoc(
      random,
      member.id,
      groupTeamMap,
      scenarioNowUtc,
      scenario,
      completionProfile,
      standingsByGroup
    )
  )
  const knockoutDocs: BracketKnockoutDoc[] = membersFile.members.map((member) =>
    generateKnockoutDoc(
      random,
      member.id,
      matchesFile.matches,
      scenarioNowUtc,
      scenario,
      completionProfile
    )
  )
  const bracketFile: BracketPredictionsFile = {
    group: groupDocs,
    knockout: knockoutDocs
  }

  const leaderboardEntries = buildLeaderboard(
    membersFile.members,
    matchesFile.matches,
    flattenPicksFile(picksFile),
    combineBracketPredictions(bracketFile),
    scoring,
    bestThirdFile.qualifiers
  )
  const leaderboardFile: LeaderboardFile = {
    lastUpdated: scenarioNowUtc,
    entries: leaderboardEntries
  }

  const scenarioDir = path.join(DEMO_SCENARIOS_DIR, scenario.id)
  await fs.mkdir(scenarioDir, { recursive: true })
  const snapshotFiles: Array<[string, unknown]> = [
    ['matches.json', matchesFile],
    ['members.json', membersFile],
    ['picks.json', picksFile],
    ['bracket-group.json', { group: groupDocs }],
    ['bracket-knockout.json', { knockout: knockoutDocs }],
    ['leaderboard.json', leaderboardFile],
    ['best-third-qualifiers.json', bestThirdFile],
    ['scoring.json', scoring],
    ['simulation-meta.json', {
      scenario: scenario.id,
      scenarioLabel: scenario.label,
      seed: args.seed,
      users: args.users,
      completionProfile,
      selectedQualifiersByGroup,
      generatedAt: new Date().toISOString(),
      timezone: PACIFIC_TIME_ZONE
    }]
  ]

  await Promise.all([
    ...snapshotFiles.map(([file, value]) => writeJson(scenarioDir, file, value))
  ])

  console.log(
    `Demo simulation generated: scenario=${scenario.id}, users=${args.users}, seed=${args.seed}, updatedAt=${scenarioNowUtc}`
  )
}

void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Failed to generate demo simulation: ${message}`)
  process.exitCode = 1
})
