import type { Match, MatchStage } from '../types/matches'

const stageSortOrder: Record<MatchStage, number> = {
  Group: 1,
  R16: 2,
  QF: 3,
  SF: 4,
  Final: 5
}

export type MatchGroup = {
  dateKey: string
  stage: MatchStage
  matches: Match[]
}

function toDateKeyLocal(utcIso: string): string {
  const date = new Date(utcIso)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function groupMatchesByDateAndStage(matches: Match[]): MatchGroup[] {
  const byKey = new Map<string, MatchGroup>()

  for (const match of matches) {
    const dateKey = toDateKeyLocal(match.kickoffUtc)
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

