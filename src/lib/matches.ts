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

export function getDateKeyLocal(utcIso: string): string {
  const date = new Date(utcIso)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getLockTime(kickoffUtc: string): Date {
  const kickoffLocal = new Date(kickoffUtc)
  const lockTime = new Date(kickoffLocal)
  lockTime.setHours(0, 0, 0, 0)
  lockTime.setDate(lockTime.getDate() - 1)
  return lockTime
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
