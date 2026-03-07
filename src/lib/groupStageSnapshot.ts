import type { Match } from '../types/matches'
import { isMatchCompleted } from './matchStatus'

export const BEST_THIRD_SLOT_COUNT = 8

export type GroupStanding = {
  code: string
  points: number
  gd: number
  ga: number
  gf: number
}

export type GroupStandingsSnapshot = {
  standingsByGroup: Map<string, GroupStanding[]>
  completeGroups: Set<string>
  totalMatchesByGroup: Map<string, number>
  finishedMatchesByGroup: Map<string, number>
}

export type GroupPlacementStatus = 'pending' | 'locked' | 'correct' | 'incorrect'
export type BestThirdStatus = 'pending' | 'locked' | 'qualified' | 'missed'

export function buildGroupStandingsSnapshot(matches: Match[]): GroupStandingsSnapshot {
  const tables = new Map<string, Map<string, GroupStanding>>()
  const totalPerGroup = new Map<string, number>()
  const finishedPerGroup = new Map<string, number>()

  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    totalPerGroup.set(match.group, (totalPerGroup.get(match.group) ?? 0) + 1)

    const groupTable = tables.get(match.group) ?? new Map<string, GroupStanding>()
    if (!groupTable.has(match.homeTeam.code)) {
      groupTable.set(match.homeTeam.code, { code: match.homeTeam.code, points: 0, gd: 0, ga: 0, gf: 0 })
    }
    if (!groupTable.has(match.awayTeam.code)) {
      groupTable.set(match.awayTeam.code, { code: match.awayTeam.code, points: 0, gd: 0, ga: 0, gf: 0 })
    }
    tables.set(match.group, groupTable)

    if (!isMatchCompleted(match) || !match.score) continue

    finishedPerGroup.set(match.group, (finishedPerGroup.get(match.group) ?? 0) + 1)

    const home = groupTable.get(match.homeTeam.code)
    const away = groupTable.get(match.awayTeam.code)
    if (!home || !away) continue

    home.gf += match.score.home
    home.ga += match.score.away
    away.gf += match.score.away
    away.ga += match.score.home
    home.gd += match.score.home - match.score.away
    away.gd += match.score.away - match.score.home

    if (match.score.home > match.score.away) {
      home.points += 3
    } else if (match.score.home < match.score.away) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }
  }

  const standingsByGroup = new Map<string, GroupStanding[]>()
  for (const [groupId, table] of tables.entries()) {
    const sorted = [...table.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.gd !== a.gd) return b.gd - a.gd
      if (b.gf !== a.gf) return b.gf - a.gf
      return a.code.localeCompare(b.code)
    })
    standingsByGroup.set(groupId, sorted)
  }

  const completeGroups = new Set<string>()
  for (const [groupId, total] of totalPerGroup.entries()) {
    if ((finishedPerGroup.get(groupId) ?? 0) >= total) completeGroups.add(groupId)
  }

  return {
    standingsByGroup,
    completeGroups,
    totalMatchesByGroup: totalPerGroup,
    finishedMatchesByGroup: finishedPerGroup
  }
}

export function normalizeTeamCodes(codes: string[] | undefined): string[] {
  if (!codes) return []
  const normalized = codes
    .map((code) => String(code ?? '').trim().toUpperCase())
    .filter((code) => code.length > 0)
  return [...new Set(normalized)]
}

export function hasExactBestThirdSelection(codes: string[] | undefined, slotCount = BEST_THIRD_SLOT_COUNT): boolean {
  return normalizeTeamCodes(codes).length === slotCount
}

export function resolveGroupPlacementStatus(
  isGroupFinal: boolean,
  isLocked: boolean,
  predictedCode?: string,
  actualCode?: string
): GroupPlacementStatus {
  if (!isGroupFinal) return isLocked ? 'locked' : 'pending'
  return predictedCode && actualCode && predictedCode === actualCode ? 'correct' : 'incorrect'
}

export function resolveGroupRowStatus(
  isGroupFinal: boolean,
  isLocked: boolean,
  firstStatus: GroupPlacementStatus,
  secondStatus: GroupPlacementStatus
): GroupPlacementStatus {
  if (!isGroupFinal) return isLocked ? 'locked' : 'pending'
  return firstStatus === 'correct' && secondStatus === 'correct' ? 'correct' : 'incorrect'
}

export function resolveBestThirdStatus(
  isFinal: boolean,
  isLocked: boolean,
  isSelectionValid: boolean,
  predictedCode: string | undefined,
  qualifiersSet: Set<string>
): BestThirdStatus {
  if (!isFinal) return isLocked ? 'locked' : 'pending'
  if (!predictedCode) return 'pending'
  if (!isSelectionValid) return 'missed'
  return qualifiersSet.has(predictedCode) ? 'qualified' : 'missed'
}
