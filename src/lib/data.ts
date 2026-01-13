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

type CacheEntry<T> = {
  data: T
  etag?: string
  lastModified?: string
  savedAt: number
}

const CACHE_TTL_MS: Record<string, number> = {
  'data/matches.json': 15 * 60 * 1000,
  'data/leaderboard.json': 15 * 60 * 1000,
  'data/scoring.json': 12 * 60 * 60 * 1000,
  'data/picks.json': 30 * 60 * 1000,
  'data/members.json': 30 * 60 * 1000,
  'data/bracket-group.json': 60 * 60 * 1000,
  'data/bracket-knockout.json': 60 * 60 * 1000,
  'data/best-third-qualifiers.json': 60 * 60 * 1000
}

const DEFAULT_TTL_MS = 15 * 60 * 1000
const STORAGE_PREFIX = 'wc-cache:'
const memoryCache = new Map<string, CacheEntry<unknown>>()

function getStorageKey(path: string) {
  return `${STORAGE_PREFIX}${path}`
}

function readCachedEntry<T>(path: string): CacheEntry<T> | null {
  const memory = memoryCache.get(path) as CacheEntry<T> | undefined
  if (memory) return memory
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(getStorageKey(path))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>
    memoryCache.set(path, parsed)
    return parsed
  } catch {
    return null
  }
}

function writeCachedEntry<T>(path: string, entry: CacheEntry<T>) {
  memoryCache.set(path, entry as CacheEntry<unknown>)
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getStorageKey(path), JSON.stringify(entry))
}

function isFresh(entry: CacheEntry<unknown> | null, ttlMs: number) {
  if (!entry) return false
  return Date.now() - entry.savedAt < ttlMs
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`
  const ttl = CACHE_TTL_MS[path] ?? DEFAULT_TTL_MS
  const cached = readCachedEntry<T>(path)

  if (isFresh(cached, ttl)) {
    return cached!.data
  }

  const headers: HeadersInit = {}
  if (cached?.etag) headers['If-None-Match'] = cached.etag
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified

  const response = await fetch(url, {
    headers,
    cache: 'no-cache'
  })

  if (response.status === 304 && cached) {
    const refreshed = { ...cached, savedAt: Date.now() }
    writeCachedEntry(path, refreshed)
    return cached.data
  }

  if (!response.ok) {
    if (cached) return cached.data
    throw new Error(`Failed to load ${path} (${response.status})`)
  }

  const data = (await response.json()) as T
  const entry: CacheEntry<T> = {
    data,
    savedAt: Date.now(),
    etag: response.headers.get('ETag') ?? cached?.etag,
    lastModified: response.headers.get('Last-Modified') ?? cached?.lastModified
  }
  writeCachedEntry(path, entry)
  return data
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
