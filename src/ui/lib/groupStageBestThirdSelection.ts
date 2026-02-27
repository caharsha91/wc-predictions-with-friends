import {
  buildGroupRankingForDisplay,
  buildGroupTeamCodes,
  isStrictGroupRanking,
  resolveStoredTopTwo
} from '../../lib/groupRanking'
import { BEST_THIRD_SLOT_COUNT, normalizeTeamCodes, type GroupStanding } from '../../lib/groupStageSnapshot'
import type { GroupPrediction } from '../../types/bracket'
import type { Team } from '../../types/matches'
import { GROUP_STAGE_GROUP_CODES } from './groupStageFilters'

export type BestThirdCandidateByGroupEntry = {
  ready: boolean
  thirdCode: string
  thirdTeamName: string
}

function normalizeBestThirds(bestThirds: string[], slotCount: number): string[] {
  const next = [...bestThirds]
  while (next.length < slotCount) next.push('')
  return next.slice(0, slotCount)
}

type BuildBestThirdCandidatesByGroupInput = {
  groups: Record<string, GroupPrediction>
  groupTeams: Record<string, Team[]>
  standingsByGroup: Map<string, GroupStanding[]>
  isReadOnly: boolean
  groupsFinal: boolean
  groupOrder?: readonly string[]
}

export function buildBestThirdCandidatesByGroup({
  groups,
  groupTeams,
  standingsByGroup,
  isReadOnly,
  groupsFinal,
  groupOrder = GROUP_STAGE_GROUP_CODES
}: BuildBestThirdCandidatesByGroupInput): Map<string, BestThirdCandidateByGroupEntry> {
  const next = new Map<string, BestThirdCandidateByGroupEntry>()

  for (const groupId of groupOrder) {
    const teams = groupTeams[groupId] ?? []
    const teamCodes = buildGroupTeamCodes(teams)
    const prediction = groups[groupId] ?? {}
    const isStrict = isStrictGroupRanking(prediction.ranking, teamCodes)
    const ranking = isStrict ? buildGroupRankingForDisplay(prediction, teamCodes) : []
    const thirdCode = ranking[2] ?? ''
    let resolvedThirdCode = thirdCode

    if (!resolvedThirdCode && (isReadOnly || groupsFinal)) {
      const topTwo = resolveStoredTopTwo(prediction, teamCodes)
      const excluded = new Set([topTwo.first, topTwo.second].filter((code): code is string => Boolean(code)))
      const standingsCodes = (standingsByGroup.get(groupId) ?? []).map((entry) => entry.code)
      resolvedThirdCode = standingsCodes.find((code) => !excluded.has(code)) ?? ''
      if (!resolvedThirdCode) {
        resolvedThirdCode = teamCodes.find((code) => !excluded.has(code)) ?? ''
      }
    }

    const thirdTeamName =
      teams.find((team) => team.code === resolvedThirdCode)?.name ??
      (resolvedThirdCode ? resolvedThirdCode : '')

    next.set(groupId, {
      ready: (isStrict || isReadOnly || groupsFinal) && Boolean(resolvedThirdCode),
      thirdCode: resolvedThirdCode,
      thirdTeamName
    })
  }

  return next
}

export function buildSelectedBestThirdGroups(
  bestThirds: string[],
  candidatesByGroup: Map<string, BestThirdCandidateByGroupEntry>,
  groupOrder: readonly string[] = GROUP_STAGE_GROUP_CODES
): Set<string> {
  const selectedCodes = new Set(normalizeTeamCodes(bestThirds))
  const selected = new Set<string>()

  for (const groupId of groupOrder) {
    const candidate = candidatesByGroup.get(groupId)
    if (!candidate?.ready || !candidate.thirdCode) continue
    if (selectedCodes.has(candidate.thirdCode)) selected.add(groupId)
  }

  return selected
}

export function buildBestThirdCodesFromSelectedGroups(
  selectedGroupIds: Set<string>,
  candidatesByGroup: Map<string, BestThirdCandidateByGroupEntry>,
  slotCount = BEST_THIRD_SLOT_COUNT,
  groupOrder: readonly string[] = GROUP_STAGE_GROUP_CODES
): string[] {
  const nextCodes: string[] = []
  for (const groupId of groupOrder) {
    if (!selectedGroupIds.has(groupId)) continue
    const candidate = candidatesByGroup.get(groupId)
    if (!candidate?.ready || !candidate.thirdCode) continue
    nextCodes.push(candidate.thirdCode)
    if (nextCodes.length >= slotCount) break
  }
  return normalizeBestThirds(nextCodes, slotCount)
}
