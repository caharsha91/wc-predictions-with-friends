import type { Match } from '../types/matches'

export type NormalizedMatchStatus = 'scheduled' | 'live' | 'completed' | 'postponed' | 'canceled' | 'unknown'

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeCompact(value: string): string {
  return normalizeKey(value).replace(/_/g, '')
}

const SCHEDULED_STATUSES = new Set(['scheduled', 'not_started', 'notstarted'])
const LIVE_STATUSES = new Set(['live', 'in_play', 'inplay', 'in_progress', 'inprogress'])
const COMPLETED_STATUSES = new Set([
  'finished',
  'completed',
  'complete',
  'full_time',
  'fulltime',
  'ft'
])
const POSTPONED_STATUSES = new Set(['postponed'])
const CANCELED_STATUSES = new Set(['canceled', 'cancelled'])

export function normalizeMatchStatus(rawStatus: unknown): NormalizedMatchStatus {
  if (typeof rawStatus !== 'string') return 'unknown'
  const normalized = normalizeKey(rawStatus)
  const compact = normalizeCompact(rawStatus)

  if (SCHEDULED_STATUSES.has(normalized) || SCHEDULED_STATUSES.has(compact)) return 'scheduled'
  if (LIVE_STATUSES.has(normalized) || LIVE_STATUSES.has(compact)) return 'live'
  if (COMPLETED_STATUSES.has(normalized) || COMPLETED_STATUSES.has(compact)) return 'completed'
  if (POSTPONED_STATUSES.has(normalized) || POSTPONED_STATUSES.has(compact)) return 'postponed'
  if (CANCELED_STATUSES.has(normalized) || CANCELED_STATUSES.has(compact)) return 'canceled'
  return 'unknown'
}

export function getMatchNormalizedStatus(match: Match): NormalizedMatchStatus {
  const status = (match as { status?: unknown }).status
  return normalizeMatchStatus(status)
}

export function isMatchCompleted(match: Match): boolean {
  return getMatchNormalizedStatus(match) === 'completed'
}

export function areMatchesCompleted(matches: Match[], predicate?: (match: Match) => boolean): boolean {
  let relevantMatchCount = 0
  for (const match of matches) {
    if (predicate && !predicate(match)) continue
    relevantMatchCount += 1
    if (!isMatchCompleted(match)) return false
  }
  return relevantMatchCount > 0
}
