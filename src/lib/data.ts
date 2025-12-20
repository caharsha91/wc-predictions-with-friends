import type { MatchesFile } from '../types/matches'
import type { MembersFile } from '../types/members'
import type { PicksFile } from '../types/picks'
import type { BracketPredictionsFile } from '../types/bracket'
import type { ScoringConfig } from '../types/scoring'

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return (await response.json()) as T
}

export function fetchMatches(): Promise<MatchesFile> {
  return fetchJson<MatchesFile>('data/matches.json')
}

export function fetchMembers(): Promise<MembersFile> {
  return fetchJson<MembersFile>('data/members.json')
}

export function fetchPicks(): Promise<PicksFile> {
  return fetchJson<PicksFile>('data/picks.json')
}

export function fetchScoring(): Promise<ScoringConfig> {
  return fetchJson<ScoringConfig>('data/scoring.json')
}

export function fetchBracketPredictions(): Promise<BracketPredictionsFile> {
  return fetchJson<BracketPredictionsFile>('data/bracket-predictions.json')
}
