import type { Match, MatchStage } from '../types/matches'

const stageSortOrder: Record<MatchStage, number> = {
  Group: 1,
  R32: 2,
  R16: 3,
  QF: 4,
  SF: 5,
  Third: 6,
  Final: 7
}

export type MatchGroup = {
  dateKey: string
  stage: MatchStage
  matches: Match[]
}

export const PACIFIC_TIME_ZONE = 'America/Los_Angeles'

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function getTimeZoneParts(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  const parts = formatter.formatToParts(date)
  const lookup: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second)
  }
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone)
  const utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return utcTime - date.getTime()
}

function makeDateInTimeZone(parts: DateParts, timeZone: string): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  const guessDate = new Date(utcGuess)
  const offset = getTimeZoneOffset(guessDate, timeZone)
  return new Date(utcGuess - offset)
}

function addDaysInTimeZone(parts: DateParts, deltaDays: number, timeZone: string): DateParts {
  const noon = makeDateInTimeZone(
    { ...parts, hour: 12, minute: 0, second: 0 },
    timeZone
  )
  const shifted = new Date(noon.getTime() + deltaDays * 24 * 60 * 60 * 1000)
  return getTimeZoneParts(shifted, timeZone)
}

function parseDateKey(dateKey: string): DateParts {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split('-')
  return {
    year: Number(yearRaw),
    month: Number(monthRaw),
    day: Number(dayRaw),
    hour: 0,
    minute: 0,
    second: 0
  }
}

export function getDateKeyLocal(utcIso: string): string {
  const date = new Date(utcIso)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDateKeyInTimeZone(
  utcIso: string,
  timeZone: string = PACIFIC_TIME_ZONE
): string {
  const parts = getTimeZoneParts(new Date(utcIso), timeZone)
  const year = String(parts.year)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLockTimePstForDateKey(dateKey: string, offsetDays: number): Date {
  const baseParts = parseDateKey(dateKey)
  const targetParts = addDaysInTimeZone(baseParts, offsetDays, PACIFIC_TIME_ZONE)
  return makeDateInTimeZone(
    { ...targetParts, hour: 23, minute: 59, second: 0 },
    PACIFIC_TIME_ZONE
  )
}

export function getLockTime(kickoffUtc: string): Date {
  const kickoffTime = new Date(kickoffUtc).getTime()
  return new Date(kickoffTime - 30 * 60 * 1000)
}

export function isMatchLocked(kickoffUtc: string, now: Date = new Date()): boolean {
  return now.getTime() >= getLockTime(kickoffUtc).getTime()
}

export function groupMatchesByDateAndStage(matches: Match[]): MatchGroup[] {
  const byKey = new Map<string, MatchGroup>()

  for (const match of matches) {
    const dateKey = getDateKeyLocal(match.kickoffUtc)
    const mapKey = `${dateKey}__${match.stage}`
    const existing = byKey.get(mapKey)
    if (existing) {
      existing.matches.push(match)
      continue
    }
    byKey.set(mapKey, { dateKey, stage: match.stage, matches: [match] })
  }

  const groups = [...byKey.values()]
  for (const group of groups) {
    group.matches.sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    )
  }

  groups.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
    return stageSortOrder[a.stage] - stageSortOrder[b.stage]
  })

  return groups
}
