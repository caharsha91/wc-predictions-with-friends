import type { MatchesFile } from '../types/matches'
import type { MembersFile } from '../types/members'
import type { PicksFile } from '../types/picks'
import type { BracketGroupFile, BracketKnockoutFile, BracketPredictionsFile } from '../types/bracket'
import type { BestThirdQualifiersFile } from '../types/qualifiers'
import type { LeaderboardFile } from '../types/leaderboard'
import type { ScoringConfig } from '../types/scoring'
import {
  fetchSimulationBestThirdQualifiers,
  fetchSimulationBracketPredictions,
  fetchSimulationLeaderboard,
  fetchSimulationMatches,
  fetchSimulationMembers,
  fetchSimulationPicks,
  isSimulationMode
} from './simulation'
async function fetchJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return (await response.json()) as T
}

export function fetchMatches(): Promise<MatchesFile> {
  if (isSimulationMode()) {
    return fetchSimulationMatches()
  }
  return fetchJson<MatchesFile>('data/matches.json')
}

export function fetchMembers(): Promise<MembersFile> {
  if (isSimulationMode()) {
    return fetchSimulationMembers()
  }
  return fetchJson<MembersFile>('data/members.json')
}

export function fetchPicks(): Promise<PicksFile> {
  if (isSimulationMode()) {
    return fetchSimulationPicks()
  }
  return fetchJson<PicksFile>('data/picks.json')
}

export function fetchScoring(): Promise<ScoringConfig> {
  return fetchJson<ScoringConfig>('data/scoring.json')
}

export async function fetchBracketPredictions(): Promise<BracketPredictionsFile> {
  if (isSimulationMode()) {
    return fetchSimulationBracketPredictions()
  }
  const [groupFile, knockoutFile] = await Promise.all([
    fetchJson<BracketGroupFile>('data/bracket-group.json'),
    fetchJson<BracketKnockoutFile>('data/bracket-knockout.json')
  ])
  return {
    group: groupFile.group ?? [],
    knockout: knockoutFile.knockout ?? []
  }
}

export function fetchBestThirdQualifiers(): Promise<BestThirdQualifiersFile> {
  if (isSimulationMode()) {
    return fetchSimulationBestThirdQualifiers()
  }
  return fetchJson<BestThirdQualifiersFile>('data/best-third-qualifiers.json')
}

export function fetchLeaderboard(): Promise<LeaderboardFile> {
  if (isSimulationMode()) {
    return fetchSimulationLeaderboard()
  }
  return fetchJson<LeaderboardFile>('data/leaderboard.json')
}
