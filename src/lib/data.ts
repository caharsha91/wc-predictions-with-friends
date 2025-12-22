import type { MatchesFile } from '../types/matches'
import type { MembersFile } from '../types/members'
import type { PicksFile } from '../types/picks'
import type { BracketPredictionsFile } from '../types/bracket'
import type { BestThirdQualifiersFile } from '../types/qualifiers'
import type { ScoringConfig } from '../types/scoring'
import { getResultsMode, getResultsSuffix } from './resultsMode'

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status})`)
  }
  return (await response.json()) as T
}

export function fetchMatches(): Promise<MatchesFile> {
  const mode = getResultsMode()
  const suffix = getResultsSuffix(mode)
  const path = suffix ? `data/matches-${suffix}.json` : 'data/matches.json'
  return fetchJson<MatchesFile>(path)
}

export function fetchMembers(): Promise<MembersFile> {
  return fetchJson<MembersFile>('data/members.json')
}

export function fetchPicks(): Promise<PicksFile> {
  const mode = getResultsMode()
  const suffix = getResultsSuffix(mode)
  const path = suffix ? `data/picks-${suffix}.json` : 'data/picks.json'
  return fetchJson<PicksFile>(path)
}

export function fetchScoring(): Promise<ScoringConfig> {
  return fetchJson<ScoringConfig>('data/scoring.json')
}

export function fetchBracketPredictions(): Promise<BracketPredictionsFile> {
  const mode = getResultsMode()
  const suffix = getResultsSuffix(mode)
  const path = suffix
    ? `data/bracket-predictions-${suffix}.json`
    : 'data/bracket-predictions.json'
  return fetchJson<BracketPredictionsFile>(path)
}

export function fetchBestThirdQualifiers(): Promise<BestThirdQualifiersFile> {
  const mode = getResultsMode()
  const suffix = getResultsSuffix(mode)
  const path = suffix
    ? `data/best-third-qualifiers-${suffix}.json`
    : 'data/best-third-qualifiers.json'
  return fetchJson<BestThirdQualifiersFile>(path)
}
