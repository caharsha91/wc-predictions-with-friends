import type {
  BracketGroupDoc,
  BracketGroupFile,
  BracketKnockoutDoc,
  BracketKnockoutFile,
  GroupPrediction
} from '../types/bracket'
import type { BestThirdQualifiersFile } from '../types/qualifiers'
import type { LeaderboardEntry, LeaderboardFile } from '../types/leaderboard'
import type { Match, MatchDecision, MatchWinner, MatchesFile, Team } from '../types/matches'
import type { Member, MembersFile } from '../types/members'
import type { KnockoutStage } from '../types/scoring'
import type {
  Pick,
  PickDecision,
  PickOutcome,
  PickWinner,
  PicksFile,
  UserPicksDoc
} from '../types/picks'
import { buildGroupStandingsSnapshot, resolveBestThirdQualifiers } from './exports'

const STORAGE_KEY = 'wc-sim-state'
const STORAGE_EVENT = 'wc-sim-change'
const USER_COUNT = 50
const DEFAULT_SCENARIO = 'group-partial'
const CURRENT_VERSION = 2

export type SimulationScenario =
  | 'group-partial'
  | 'group-complete'
  | 'knockout-partial'
  | 'knockout-complete'

export type SimulationPlacement = 'podium' | 'first-page' | 'middle' | 'last'

export type SimulationUserRole = 'admin' | 'user'

export type SimulationUser = {
  id: string
  name: string
  email: string
  role: SimulationUserRole
}

export type SimulationState = {
  version: number
  enabled: boolean
  scenario: SimulationScenario
  placement: SimulationPlacement
  simNow: string
  selectedUserId: string
  users: SimulationUser[]
  picks: PicksFile
  bracketGroup: BracketGroupFile
  bracketKnockout: BracketKnockoutFile
}

const SCENARIO_DEFAULTS: Record<SimulationScenario, { simNow: string; rank: number }> = {
  'group-partial': { simNow: '2026-06-18T20:00:00Z', rank: 2 },
  'group-complete': { simNow: '2026-06-28T12:00:00Z', rank: 4 },
  'knockout-partial': { simNow: '2026-07-05T18:00:00Z', rank: 25 },
  'knockout-complete': { simNow: '2026-07-20T12:00:00Z', rank: 50 }
}

const PLACEMENT_RANKS: Record<SimulationPlacement, number> = {
  podium: 2,
  'first-page': 4,
  middle: 25,
  last: 50
}

const SCENARIO_PLACEMENT_DEFAULTS: Record<SimulationScenario, SimulationPlacement> = {
  'group-partial': 'podium',
  'group-complete': 'first-page',
  'knockout-partial': 'middle',
  'knockout-complete': 'last'
}

let cachedBaseMatches: MatchesFile | null = null

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isScenario(value: string): value is SimulationScenario {
  return value in SCENARIO_DEFAULTS
}

function isPlacement(value: string): value is SimulationPlacement {
  return value in PLACEMENT_RANKS
}

function baseState(): SimulationState {
  return {
    version: CURRENT_VERSION,
    enabled: false,
    scenario: DEFAULT_SCENARIO,
    placement: SCENARIO_PLACEMENT_DEFAULTS[DEFAULT_SCENARIO],
    simNow: SCENARIO_DEFAULTS[DEFAULT_SCENARIO].simNow,
    selectedUserId: 'sim-user-01',
    users: [],
    picks: { picks: [] },
    bracketGroup: { group: [] },
    bracketKnockout: { knockout: [] }
  }
}

function normalizeState(raw?: Partial<SimulationState> | null): SimulationState {
  const fallback = baseState()
  if (!raw) return fallback
  const scenario = raw.scenario && isScenario(raw.scenario) ? raw.scenario : fallback.scenario
  const placement =
    raw.placement && isPlacement(raw.placement)
      ? raw.placement
      : SCENARIO_PLACEMENT_DEFAULTS[scenario]
  const simNow = SCENARIO_DEFAULTS[scenario].simNow
  return {
    ...fallback,
    ...raw,
    scenario,
    placement,
    simNow,
    users: Array.isArray(raw.users) ? raw.users : fallback.users,
    picks: raw.picks && Array.isArray(raw.picks.picks) ? raw.picks : fallback.picks,
    bracketGroup:
      raw.bracketGroup && Array.isArray(raw.bracketGroup.group)
        ? raw.bracketGroup
        : fallback.bracketGroup,
    bracketKnockout:
      raw.bracketKnockout && Array.isArray(raw.bracketKnockout.knockout)
        ? raw.bracketKnockout
        : fallback.bracketKnockout
  }
}

export function getSimulationState(): SimulationState {
  if (!canUseStorage()) return baseState()
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const initial = baseState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
    return initial
  }
  try {
    return normalizeState(JSON.parse(raw) as Partial<SimulationState>)
  } catch {
    return baseState()
  }
}

export function setSimulationState(next: SimulationState): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT))
}

export function updateSimulationState(update: Partial<SimulationState>): SimulationState {
  const current = getSimulationState()
  const next = normalizeState({ ...current, ...update })
  setSimulationState(next)
  return next
}

export function subscribeSimulationState(listener: () => void): () => void {
  if (!canUseStorage()) return () => {}
  const handle = () => listener()
  window.addEventListener(STORAGE_EVENT, handle)
  window.addEventListener('storage', handle)
  return () => {
    window.removeEventListener(STORAGE_EVENT, handle)
    window.removeEventListener('storage', handle)
  }
}

export function isSimulationMode(): boolean {
  return getSimulationState().enabled
}

export function setSimulationEnabled(enabled: boolean): SimulationState {
  return updateSimulationState({ enabled })
}

export function setSimulationScenario(scenario: SimulationScenario): SimulationState {
  const defaults = SCENARIO_DEFAULTS[scenario]
  return updateSimulationState({ scenario, simNow: defaults.simNow })
}

export function setSimulationPlacement(placement: SimulationPlacement): SimulationState {
  return updateSimulationState({ placement })
}

export function setSimulationNow(simNow: string): SimulationState {
  return updateSimulationState({ simNow })
}

export function setSimulationSelectedUser(selectedUserId: string): SimulationState {
  return updateSimulationState({ selectedUserId })
}

export function setSimulationUserRole(userId: string, role: SimulationUserRole): SimulationState {
  const current = getSimulationState()
  const users = current.users.map((user) => (user.id === userId ? { ...user, role } : user))
  return updateSimulationState({ users })
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getOutcomeFromScores(homeScore: number, awayScore: number): PickOutcome {
  if (homeScore > awayScore) return 'WIN'
  if (homeScore < awayScore) return 'LOSS'
  return 'DRAW'
}

function buildUsers(): SimulationUser[] {
  const users: SimulationUser[] = []
  for (let i = 1; i <= USER_COUNT; i += 1) {
    const index = String(i).padStart(2, '0')
    users.push({
      id: `sim-user-${index}`,
      name: `Sim User ${i}`,
      email: `sim.user${i}@example.com`,
      role: i <= 5 ? 'admin' : 'user'
    })
  }
  return users
}

function buildPickForMatch(
  userId: string,
  match: Match,
  scenario: SimulationScenario,
  simNow: string
): Pick {
  const seed = hashString(`${scenario}:${userId}:${match.id}`)
  const homeScore = seed % 4
  const awayScore = Math.floor(seed / 4) % 4
  const outcome = getOutcomeFromScores(homeScore, awayScore)
  let winner: PickWinner | undefined
  let decidedBy: PickDecision | undefined

  if (match.stage !== 'Group') {
    if (outcome === 'DRAW') {
      winner = seed % 2 === 0 ? 'HOME' : 'AWAY'
      decidedBy = seed % 3 === 0 ? 'ET' : 'PENS'
    } else {
      winner = outcome === 'WIN' ? 'HOME' : 'AWAY'
    }
  }

  const createdAt = simNow
  return {
    id: `pick-${userId}-${match.id}`,
    matchId: match.id,
    userId,
    homeScore,
    awayScore,
    outcome,
    winner,
    decidedBy,
    createdAt,
    updatedAt: createdAt
  }
}

function buildPicks(
  users: SimulationUser[],
  matches: Match[],
  scenario: SimulationScenario,
  simNow: string
): PicksFile {
  const picks: UserPicksDoc[] = users.map((user) => ({
    userId: user.id,
    updatedAt: simNow,
    picks: matches.map((match) => buildPickForMatch(user.id, match, scenario, simNow))
  }))
  return { picks }
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groupMap = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teams = groupMap.get(match.group) ?? new Map<string, Team>()
    teams.set(match.homeTeam.code, match.homeTeam)
    teams.set(match.awayTeam.code, match.awayTeam)
    groupMap.set(match.group, teams)
  }

  const result: Record<string, Team[]> = {}
  for (const [groupId, teams] of groupMap.entries()) {
    result[groupId] = [...teams.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return result
}

function buildBestThirds(
  userId: string,
  scenario: SimulationScenario,
  groupTeams: Record<string, Team[]>
): string[] {
  const teamCodes = new Set<string>()
  for (const teams of Object.values(groupTeams)) {
    for (const team of teams) {
      if (team.code && team.code !== 'TBD') {
        teamCodes.add(team.code)
      }
    }
  }
  const ranked = [...teamCodes].map((code) => ({
    code,
    score: hashString(`${scenario}:${userId}:third:${code}`)
  }))
  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.code.localeCompare(b.code)
  })
  return ranked.slice(0, 8).map((entry) => entry.code)
}

function buildGroupPredictions(
  userId: string,
  scenario: SimulationScenario,
  groupTeams: Record<string, Team[]>
): { groups: Record<string, GroupPrediction>; bestThirds: string[] } {
  const groups: Record<string, GroupPrediction> = {}
  const groupIds = Object.keys(groupTeams).sort()
  for (const groupId of groupIds) {
    const teams = groupTeams[groupId] ?? []
    if (teams.length === 0) {
      groups[groupId] = {}
      continue
    }
    if (teams.length === 1) {
      groups[groupId] = { first: teams[0].code }
      continue
    }
    const firstSeed = hashString(`${scenario}:${userId}:${groupId}:first`)
    const secondSeed = hashString(`${scenario}:${userId}:${groupId}:second`)
    const firstIndex = firstSeed % teams.length
    let secondIndex = secondSeed % teams.length
    if (secondIndex === firstIndex) {
      secondIndex = (secondIndex + 1) % teams.length
    }
    groups[groupId] = {
      first: teams[firstIndex].code,
      second: teams[secondIndex].code
    }
  }
  return {
    groups,
    bestThirds: buildBestThirds(userId, scenario, groupTeams)
  }
}

function buildGroupDocs(
  users: SimulationUser[],
  matches: Match[],
  scenario: SimulationScenario,
  updatedAt: string
): BracketGroupDoc[] {
  const groupTeams = buildGroupTeams(matches)
  return users.map((user) => {
    const { groups, bestThirds } = buildGroupPredictions(user.id, scenario, groupTeams)
    return {
      userId: user.id,
      groups,
      bestThirds,
      updatedAt
    }
  })
}

function buildKnockoutDocs(
  users: SimulationUser[],
  matches: Match[],
  scenario: SimulationScenario,
  updatedAt: string
): BracketKnockoutDoc[] {
  const knockoutMatches = matches.filter((match) => match.stage !== 'Group')
  return users.map((user) => {
    const knockout: Partial<Record<KnockoutStage, Record<string, MatchWinner>>> = {}
    for (const match of knockoutMatches) {
      const stage = match.stage as KnockoutStage
      const stagePredictions = knockout[stage] ?? {}
      const seed = hashString(`${scenario}:${user.id}:${match.id}:ko`)
      stagePredictions[match.id] = seed % 2 === 0 ? 'HOME' : 'AWAY'
      knockout[stage] = stagePredictions
    }
    return {
      userId: user.id,
      knockout,
      updatedAt
    }
  })
}

function buildTeamMap(matches: Match[]): Map<string, Team> {
  const teamMap = new Map<string, Team>()
  for (const match of matches) {
    if (match.stage !== 'Group') continue
    teamMap.set(match.homeTeam.code, match.homeTeam)
    teamMap.set(match.awayTeam.code, match.awayTeam)
  }
  return teamMap
}

function assignKnockoutTeams(matches: Match[]): Match[] {
  const teamMap = buildTeamMap(matches)
  const teamList = [...teamMap.values()]
    .filter((team) => team.code !== 'TBD')
    .sort((a, b) => a.code.localeCompare(b.code))
  let index = 0
  return matches.map((match) => {
    if (match.stage === 'Group' || teamList.length === 0) return match
    const home = teamList[index % teamList.length]
    index += 1
    let away = teamList[index % teamList.length]
    index += 1
    if (away.code === home.code && teamList.length > 1) {
      away = teamList[index % teamList.length]
      index += 1
    }
    return { ...match, homeTeam: home, awayTeam: away }
  })
}

function withMatchResult(match: Match): Match {
  const seed = hashString(match.id)
  const homeScore = seed % 4
  const awayScore = Math.floor(seed / 4) % 4
  let winner: MatchWinner | undefined
  let decidedBy: MatchDecision | undefined

  if (homeScore > awayScore) {
    winner = 'HOME'
  } else if (homeScore < awayScore) {
    winner = 'AWAY'
  } else if (match.stage !== 'Group') {
    winner = seed % 2 === 0 ? 'HOME' : 'AWAY'
    decidedBy = seed % 3 === 0 ? 'ET' : 'PENS'
  }

  return {
    ...match,
    score: { home: homeScore, away: awayScore },
    winner,
    decidedBy
  }
}

function withoutMatchResult(match: Match): Match {
  const { score: _score, winner: _winner, decidedBy: _decidedBy, ...rest } = match
  return rest
}

function applyScenarioToMatches(
  matches: Match[],
  scenario: SimulationScenario,
  simNow: string
): Match[] {
  const now = new Date(simNow).getTime()
  const needsKnockoutTeams = scenario === 'knockout-partial' || scenario === 'knockout-complete'
  const seededMatches = needsKnockoutTeams ? assignKnockoutTeams(matches) : matches

  return seededMatches.map((match) => {
    let status: Match['status'] = 'SCHEDULED'
    if (scenario === 'group-partial') {
      if (match.stage === 'Group' && new Date(match.kickoffUtc).getTime() <= now) {
        status = 'FINISHED'
      }
    } else if (scenario === 'group-complete') {
      status = match.stage === 'Group' ? 'FINISHED' : 'SCHEDULED'
    } else if (scenario === 'knockout-partial') {
      if (match.stage === 'Group') {
        status = 'FINISHED'
      } else if (new Date(match.kickoffUtc).getTime() <= now) {
        status = 'FINISHED'
      }
    } else if (scenario === 'knockout-complete') {
      status = 'FINISHED'
    }

    const withStatus = { ...match, status }
    return status === 'FINISHED' ? withMatchResult(withStatus) : withoutMatchResult(withStatus)
  })
}

async function fetchSimulationBaseMatches(): Promise<MatchesFile> {
  if (cachedBaseMatches) return cachedBaseMatches
  const url = `${import.meta.env.BASE_URL}data/sim-matches.json`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load sim-matches.json (${response.status})`)
  }
  cachedBaseMatches = (await response.json()) as MatchesFile
  return cachedBaseMatches
}

export async function resetSimulationState(
  overrides: Partial<SimulationState> = {}
): Promise<SimulationState> {
  const current = getSimulationState()
  const scenario =
    overrides.scenario && isScenario(overrides.scenario) ? overrides.scenario : current.scenario
  const simNow = SCENARIO_DEFAULTS[scenario].simNow
  const enabled = overrides.enabled ?? current.enabled
  const placement =
    overrides.placement && isPlacement(overrides.placement)
      ? overrides.placement
      : isPlacement(current.placement)
        ? current.placement
        : SCENARIO_PLACEMENT_DEFAULTS[scenario]
  const users = buildUsers()
  const baseMatches = await fetchSimulationBaseMatches()
  const selectedUserId =
    overrides.selectedUserId && users.some((user) => user.id === overrides.selectedUserId)
      ? overrides.selectedUserId
      : users[0]?.id ?? current.selectedUserId

  const next: SimulationState = {
    version: CURRENT_VERSION,
    enabled,
    scenario,
    placement,
    simNow,
    selectedUserId,
    users,
    picks: buildPicks(users, baseMatches.matches, scenario, simNow),
    bracketGroup: { group: buildGroupDocs(users, baseMatches.matches, scenario, simNow) },
    bracketKnockout: { knockout: buildKnockoutDocs(users, baseMatches.matches, scenario, simNow) }
  }

  setSimulationState(next)
  return next
}

export async function ensureSimulationStateReady(): Promise<SimulationState> {
  const current = getSimulationState()
  if (
    current.version === CURRENT_VERSION &&
    current.users.length === USER_COUNT &&
    current.picks.picks.length === USER_COUNT &&
    current.bracketGroup.group.length === USER_COUNT &&
    current.bracketKnockout.knockout.length === USER_COUNT
  ) {
    return current
  }
  return resetSimulationState({
    enabled: current.enabled,
    scenario: current.scenario,
    simNow: current.simNow,
    selectedUserId: current.selectedUserId
  })
}

export async function fetchSimulationMatches(): Promise<MatchesFile> {
  const state = getSimulationState()
  const baseMatches = await fetchSimulationBaseMatches()
  return {
    lastUpdated: state.simNow,
    matches: applyScenarioToMatches(baseMatches.matches, state.scenario, state.simNow)
  }
}

export async function fetchSimulationMembers(): Promise<MembersFile> {
  const state = await ensureSimulationStateReady()
  const members: Member[] = state.users.map((user, index) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    handle: `sim${index + 1}`,
    isAdmin: user.role === 'admin'
  }))
  return { members }
}

export async function fetchSimulationPicks(): Promise<PicksFile> {
  const state = await ensureSimulationStateReady()
  return state.picks
}

export async function fetchSimulationBracketPredictions(): Promise<{
  group: BracketGroupDoc[]
  knockout: BracketKnockoutDoc[]
}> {
  const state = await ensureSimulationStateReady()
  return {
    group: state.bracketGroup.group ?? [],
    knockout: state.bracketKnockout.knockout ?? []
  }
}

export async function fetchSimulationBestThirdQualifiers(): Promise<BestThirdQualifiersFile> {
  const matchesFile = await fetchSimulationMatches()
  const standings = buildGroupStandingsSnapshot(matchesFile.matches)
  const qualifiers = resolveBestThirdQualifiers(standings) ?? []
  return {
    updatedAt: matchesFile.lastUpdated,
    qualifiers
  }
}

export async function fetchSimulationLeaderboard(): Promise<LeaderboardFile> {
  const state = await ensureSimulationStateReady()
  const memberMap = new Map<string, SimulationUser>(state.users.map((user) => [user.id, user]))
  const sortedIds = [...memberMap.keys()].sort()
  const selectedId = memberMap.has(state.selectedUserId) ? state.selectedUserId : sortedIds[0]
  const placement =
    isPlacement(state.placement) && PLACEMENT_RANKS[state.placement]
      ? state.placement
      : SCENARIO_PLACEMENT_DEFAULTS[state.scenario]
  const placementRank =
    PLACEMENT_RANKS[placement] ?? SCENARIO_DEFAULTS[state.scenario]?.rank ?? 1
  const rankForSelected = Math.min(placementRank, sortedIds.length)
  const withoutSelected = sortedIds.filter((id) => id !== selectedId)
  withoutSelected.splice(rankForSelected - 1, 0, selectedId)

  const entries: LeaderboardEntry[] = withoutSelected.map((userId, index) => {
    const user = memberMap.get(userId)
    const rank = index + 1
    const baseTime = new Date(state.simNow).getTime()
    const totalPoints = Math.max(0, (sortedIds.length - rank + 1) * 3)
    const exactPoints = Math.floor(totalPoints * 0.4)
    const resultPoints = Math.floor(totalPoints * 0.3)
    const knockoutPoints = Math.floor(totalPoints * 0.2)
    const bracketPoints = totalPoints - exactPoints - resultPoints - knockoutPoints
    return {
      member: {
        id: userId,
        name: user?.name ?? `Sim User ${rank}`,
        email: user?.email,
        handle: `sim${rank}`,
        isAdmin: user?.role === 'admin'
      },
      totalPoints,
      exactPoints,
      resultPoints,
      knockoutPoints,
      bracketPoints,
      exactCount: Math.floor(exactPoints / 2),
      picksCount: 0,
      earliestSubmission: new Date(baseTime - rank * 60 * 1000).toISOString()
    }
  })

  return {
    lastUpdated: state.simNow,
    entries
  }
}
