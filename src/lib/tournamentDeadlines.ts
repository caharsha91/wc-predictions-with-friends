import type { Match } from '../types/matches'

const GROUP_STAGE_LOCK_OFFSET_MS = 30 * 60 * 1000

export type TournamentDeadlines = {
  groupStageDeadlineUtc: string
  firstKoKickoffUtc: string | null
}

function parseUtcMs(utcIso: string): number | null {
  const value = new Date(utcIso).getTime()
  return Number.isFinite(value) ? value : null
}

function getEarliestKickoffMs(matches: Match[], include: (match: Match) => boolean): number | null {
  let earliest: number | null = null
  for (const match of matches) {
    if (!include(match)) continue
    const kickoffMs = parseUtcMs(match.kickoffUtc)
    if (kickoffMs === null) continue
    if (earliest === null || kickoffMs < earliest) earliest = kickoffMs
  }
  return earliest
}

export function resolveTournamentDeadlines(matches: Match[]): TournamentDeadlines {
  const firstGroupKickoffMs = getEarliestKickoffMs(matches, (match) => match.stage === 'Group')
  const firstKoKickoffMs = getEarliestKickoffMs(matches, (match) => match.stage !== 'Group')

  return {
    groupStageDeadlineUtc:
      firstGroupKickoffMs === null
        ? ''
        : new Date(firstGroupKickoffMs - GROUP_STAGE_LOCK_OFFSET_MS).toISOString(),
    firstKoKickoffUtc: firstKoKickoffMs === null ? null : new Date(firstKoKickoffMs).toISOString()
  }
}
