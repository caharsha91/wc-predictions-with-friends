import type { GroupPrediction } from '../types/bracket'
import type { Team } from '../types/matches'

function normalizeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeTeamCodeList(teamCodes: string[]): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  for (const code of teamCodes) {
    const normalized = normalizeCode(code)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

function includesCode(codes: string[], candidate: string): boolean {
  return codes.includes(candidate)
}

export function buildGroupTeamCodes(teams: Team[]): string[] {
  return normalizeTeamCodeList(teams.map((team) => team.code))
}

export function normalizeGroupRanking(
  ranking: string[] | undefined,
  teamCodes: string[]
): string[] {
  if (!Array.isArray(ranking) || ranking.length === 0) return []
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  const allowed = new Set(normalizedTeams)
  const next: string[] = []
  for (const value of ranking) {
    const normalized = normalizeCode(value)
    if (!normalized || !allowed.has(normalized) || includesCode(next, normalized)) continue
    next.push(normalized)
  }
  return next
}

export function isStrictGroupRanking(ranking: string[] | undefined, teamCodes: string[]): boolean {
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  if (normalizedTeams.length === 0) return false
  const normalizedRanking = normalizeGroupRanking(ranking, normalizedTeams)
  return normalizedRanking.length === normalizedTeams.length
}

export function resolveStoredTopTwo(
  group: GroupPrediction | undefined,
  teamCodes: string[]
): { first?: string; second?: string } {
  if (!group) return {}
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  if (normalizedTeams.length === 0) return {}
  const allowed = new Set(normalizedTeams)
  const ranking = normalizeGroupRanking(group.ranking, normalizedTeams)
  if (ranking.length === normalizedTeams.length && ranking.length >= 2) {
    return { first: ranking[0], second: ranking[1] }
  }

  const first = normalizeCode(group.first)
  const second = normalizeCode(group.second)
  const safeFirst = first && allowed.has(first) ? first : undefined
  const safeSecond = second && allowed.has(second) && second !== safeFirst ? second : undefined
  return {
    first: safeFirst,
    second: safeSecond
  }
}

export function buildGroupRankingForDisplay(
  group: GroupPrediction | undefined,
  teamCodes: string[]
): string[] {
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  if (normalizedTeams.length === 0) return []
  const allowed = new Set(normalizedTeams)
  const next: string[] = []
  const push = (value: string | undefined) => {
    const normalized = normalizeCode(value)
    if (!normalized || !allowed.has(normalized) || includesCode(next, normalized)) return
    next.push(normalized)
  }

  const ranking = normalizeGroupRanking(group?.ranking, normalizedTeams)
  const topTwo = resolveStoredTopTwo(group, normalizedTeams)
  push(topTwo.first)
  push(topTwo.second)
  for (const code of ranking) push(code)
  for (const code of normalizedTeams) push(code)
  return next.slice(0, normalizedTeams.length)
}

export function applyGroupRanking(
  group: GroupPrediction | undefined,
  ranking: string[],
  teamCodes: string[]
): GroupPrediction {
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  const normalizedRanking = normalizeGroupRanking(ranking, normalizedTeams)
  const strictRanking = normalizedTeams.length > 0 && normalizedRanking.length === normalizedTeams.length
  const next: GroupPrediction = {
    ...(group ?? {})
  }

  if (strictRanking) {
    next.ranking = normalizedRanking
    next.first = normalizedRanking[0]
    next.second = normalizedRanking[1]
    return next
  }

  delete next.ranking
  const topTwo = resolveStoredTopTwo(group, normalizedTeams)
  if (topTwo.first) next.first = topTwo.first
  else delete next.first
  if (topTwo.second) next.second = topTwo.second
  else delete next.second
  return next
}

export function hasAnyGroupRankingSelection(
  group: GroupPrediction | undefined,
  teamCodes: string[]
): boolean {
  if (!group) return false
  const normalizedTeams = normalizeTeamCodeList(teamCodes)
  const normalizedRanking = normalizeGroupRanking(group.ranking, normalizedTeams)
  if (normalizedRanking.length > 0) return true
  const topTwo = resolveStoredTopTwo(group, normalizedTeams)
  return Boolean(topTwo.first || topTwo.second)
}
