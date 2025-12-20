import type { MatchesFile } from '../types/matches'
import type { MembersFile } from '../types/members'
import type { PicksFile } from '../types/picks'
import type { BracketPredictionsFile } from '../types/bracket'
import type { BestThirdQualifiersFile } from '../types/qualifiers'
import type { ScoringConfig } from '../types/scoring'
import { getResultsMode } from './resultsMode'

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
  const path = mode === 'simulated' ? 'data/matches-simulated.json' : 'data/matches.json'
  return fetchJson<MatchesFile>(path)
}

export function fetchMembers(): Promise<MembersFile> {
  return fetchJson<MembersFile>('data/members.json')
}

export function fetchPicks(): Promise<PicksFile> {
  const mode = getResultsMode()
  const path = mode === 'simulated' ? 'data/picks-simulated.json' : 'data/picks.json'
  return fetchJson<PicksFile>(path)
}

export function fetchScoring(): Promise<ScoringConfig> {
  return fetchJson<ScoringConfig>('data/scoring.json')
}

export function fetchBracketPredictions(): Promise<BracketPredictionsFile> {
  const mode = getResultsMode()
  const path =
    mode === 'simulated' ? 'data/bracket-predictions-simulated.json' : 'data/bracket-predictions.json'
  return fetchJson<BracketPredictionsFile>(path)
}

export function fetchBestThirdQualifiers(): Promise<BestThirdQualifiersFile> {
  const mode = getResultsMode()
  const path =
    mode === 'simulated'
      ? 'data/best-third-qualifiers-simulated.json'
      : 'data/best-third-qualifiers.json'
  return fetchJson<BestThirdQualifiersFile>(path)
}
