import type { Match } from '../../types/matches'
import { getMatchNormalizedStatus, type NormalizedMatchStatus } from '../../lib/matchStatus'
import type { LockFlags } from './tournamentPhase'

const EDITABLE_WINDOW_MS = 48 * 60 * 60 * 1000

export type MatchTimelineSection = 'UPCOMING' | 'RECENT_RESULTS' | 'OLDER_RESULTS'

export type MatchReadOnlyReason =
  | 'editable'
  | 'global-lock'
  | 'outside-window'
  | 'in-progress'
  | 'not-scheduled'
  | 'missing-kickoff'

export type MatchTimelineWindow = {
  anchorUtc: string | null
  endUtc: string | null
  source: 'next-upcoming' | 'most-recent' | 'none'
}

export type MatchTimelineItem = {
  match: Match
  section: MatchTimelineSection
  normalizedStatus: NormalizedMatchStatus
  editable: boolean
  readOnlyReason: MatchReadOnlyReason
  kickoffMs: number | null
  sortMs: number
}

export type MatchTimelineModel = {
  generatedAtUtc: string
  hasFixtures: boolean
  window: MatchTimelineWindow
  upcoming: MatchTimelineItem[]
  recentResults: MatchTimelineItem[]
  olderResults: MatchTimelineItem[]
}

function parseUtcMs(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function toUtcIso(valueMs: number | null): string | null {
  if (valueMs === null) return null
  return new Date(valueMs).toISOString()
}

function resolveCompletionMs(match: Match): number | null {
  const record = match as Record<string, unknown>
  const completionFields = [
    'completionUtc',
    'completedUtc',
    'finishedUtc',
    'finalWhistleUtc',
    'endedUtc',
    'updatedAt'
  ]

  for (const field of completionFields) {
    if (typeof record[field] !== 'string') continue
    const parsed = parseUtcMs(record[field] as string)
    if (parsed !== null) return parsed
  }

  return parseUtcMs(match.kickoffUtc)
}

function computeEditableWindow(matches: Match[], nowMs: number): MatchTimelineWindow {
  const kickoffTimes = matches
    .map((match) => parseUtcMs(match.kickoffUtc))
    .filter((value): value is number => value !== null)

  if (kickoffTimes.length === 0) {
    return {
      anchorUtc: null,
      endUtc: null,
      source: 'none'
    }
  }

  const futureKickoffs = kickoffTimes.filter((kickoffMs) => kickoffMs >= nowMs).sort((a, b) => a - b)
  const anchorMs =
    futureKickoffs.length > 0 ? futureKickoffs[0] : kickoffTimes.reduce((current, kickoffMs) => Math.max(current, kickoffMs), kickoffTimes[0]!)
  const source: MatchTimelineWindow['source'] = futureKickoffs.length > 0 ? 'next-upcoming' : 'most-recent'

  return {
    anchorUtc: toUtcIso(anchorMs),
    endUtc: toUtcIso(anchorMs + EDITABLE_WINDOW_MS),
    source
  }
}

function isKickoffInsideEditableWindow(kickoffMs: number, nowMs: number, window: MatchTimelineWindow): boolean {
  const anchorMs = parseUtcMs(window.anchorUtc)
  const endMs = parseUtcMs(window.endUtc)
  if (anchorMs === null || endMs === null) return false
  return kickoffMs >= nowMs && kickoffMs >= anchorMs && kickoffMs <= endMs
}

export function isMatchEditable(
  match: Match,
  nowUtc: string,
  lockFlags: Pick<LockFlags, 'matchPicksEditable'>,
  window?: MatchTimelineWindow
): boolean {
  if (!lockFlags.matchPicksEditable) return false
  const normalizedStatus = getMatchNormalizedStatus(match)
  if (normalizedStatus !== 'scheduled') return false

  const nowMs = parseUtcMs(nowUtc) ?? Date.now()
  const kickoffMs = parseUtcMs(match.kickoffUtc)
  if (kickoffMs === null) return false

  const resolvedWindow = window ?? computeEditableWindow([match], nowMs)
  return isKickoffInsideEditableWindow(kickoffMs, nowMs, resolvedWindow)
}

function resolveReadOnlyReason({
  match,
  normalizedStatus,
  lockFlags,
  nowMs,
  window,
  editable
}: {
  match: Match
  normalizedStatus: NormalizedMatchStatus
  lockFlags: Pick<LockFlags, 'matchPicksEditable'>
  nowMs: number
  window: MatchTimelineWindow
  editable: boolean
}): MatchReadOnlyReason {
  if (editable) return 'editable'
  if (!lockFlags.matchPicksEditable) return 'global-lock'
  if (normalizedStatus === 'live') return 'in-progress'
  if (normalizedStatus !== 'scheduled') return 'not-scheduled'

  const kickoffMs = parseUtcMs(match.kickoffUtc)
  if (kickoffMs === null) return 'missing-kickoff'
  if (!isKickoffInsideEditableWindow(kickoffMs, nowMs, window)) return 'outside-window'
  return 'not-scheduled'
}

function sortByLatestFirst(left: MatchTimelineItem, right: MatchTimelineItem): number {
  return right.sortMs - left.sortMs
}

function sortByEarliestFirst(left: MatchTimelineItem, right: MatchTimelineItem): number {
  return left.sortMs - right.sortMs
}

export function computeMatchTimelineModel(
  matches: Match[],
  nowUtc: string,
  lockFlags: Pick<LockFlags, 'matchPicksEditable'>
): MatchTimelineModel {
  const nowMs = parseUtcMs(nowUtc) ?? Date.now()
  const window = computeEditableWindow(matches, nowMs)
  const hasFixtures = window.source !== 'none'

  const upcoming: MatchTimelineItem[] = []
  const recentResults: MatchTimelineItem[] = []
  const olderResults: MatchTimelineItem[] = []

  for (const match of matches) {
    const normalizedStatus = getMatchNormalizedStatus(match)
    const kickoffMs = parseUtcMs(match.kickoffUtc)
    const completionMs = resolveCompletionMs(match)

    let section: MatchTimelineSection
    if (normalizedStatus === 'scheduled' || normalizedStatus === 'live') {
      section = kickoffMs === null ? 'OLDER_RESULTS' : 'UPCOMING'
    } else if (normalizedStatus === 'completed') {
      if (completionMs === null) {
        section = 'OLDER_RESULTS'
      } else {
        section = completionMs >= nowMs - EDITABLE_WINDOW_MS ? 'RECENT_RESULTS' : 'OLDER_RESULTS'
      }
    } else {
      section = 'OLDER_RESULTS'
    }

    const editable = section === 'UPCOMING' && isMatchEditable(match, nowUtc, lockFlags, window)
    const readOnlyReason = resolveReadOnlyReason({
      match,
      normalizedStatus,
      lockFlags,
      nowMs,
      window,
      editable
    })
    const sortMs =
      section === 'UPCOMING'
        ? kickoffMs ?? Number.NEGATIVE_INFINITY
        : completionMs ?? kickoffMs ?? Number.NEGATIVE_INFINITY

    const item: MatchTimelineItem = {
      match,
      section,
      normalizedStatus,
      editable,
      readOnlyReason,
      kickoffMs,
      sortMs
    }

    if (section === 'UPCOMING') {
      upcoming.push(item)
    } else if (section === 'RECENT_RESULTS') {
      recentResults.push(item)
    } else {
      olderResults.push(item)
    }
  }

  return {
    generatedAtUtc: nowUtc,
    hasFixtures,
    window,
    upcoming: upcoming.sort(sortByEarliestFirst),
    recentResults: recentResults.sort(sortByLatestFirst),
    olderResults: olderResults.sort(sortByLatestFirst)
  }
}
