import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import {
  BEST_THIRD_SLOT_COUNT,
  buildGroupStandingsSnapshot,
  normalizeTeamCodes,
  resolveBestThirdStatus,
  resolveGroupPlacementStatus,
  resolveGroupRowStatus
} from '../../lib/groupStageSnapshot'
import {
  buildGroupRankingForDisplay,
  buildGroupTeamCodes,
  isStrictGroupRanking,
  resolveStoredTopTwo
} from '../../lib/groupRanking'
import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import TeamFlagLabelV2 from '../components/v2/TeamFlagLabelV2'
import {
  BestThirdPicksCompact,
  GroupPicksDenseTable,
  LeaderboardCardCurated,
  type BestThirdGroupTile,
  type GroupStageDenseRow,
  type LeaderboardCardRow
} from '../components/group-stage/GroupStageDashboardComponents'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useAuthState } from '../hooks/useAuthState'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { formatUtcAndLocalDeadline } from '../lib/deadline'
import { readUserProfile } from '../lib/profilePersistence'
import { rankRowsWithTiePriority } from '../lib/leaderboardTieRanking'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { cn } from '../lib/utils'
import {
  GROUP_STAGE_GROUP_CODES,
  stripLegacyGroupStageParams
} from '../lib/groupStageFilters'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { buildProjectedImpactRows } from '../lib/projectedImpact'

const BEST_THIRD_SLOTS = BEST_THIRD_SLOT_COUNT
const DEFAULT_GROUP_QUALIFIER_POINTS = 3
const DESKTOP_PREVIEW_ROW_COUNT = 9
const EMPTY_MATCHES: Match[] = []
const GROUP_ID_PATTERN = /^[A-L]$/

type GroupJumpStatus = 'complete' | 'incomplete' | 'locked'

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groups = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teamMap = groups.get(match.group) ?? new Map<string, Team>()
    teamMap.set(match.homeTeam.code, match.homeTeam)
    teamMap.set(match.awayTeam.code, match.awayTeam)
    groups.set(match.group, teamMap)
  }

  const next: Record<string, Team[]> = {}
  for (const [groupId, teamMap] of groups.entries()) {
    next[groupId] = [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return next
}

function normalizeBestThirds(bestThirds: string[]): string[] {
  const next = [...bestThirds]
  while (next.length < BEST_THIRD_SLOTS) next.push('')
  return next.slice(0, BEST_THIRD_SLOTS)
}

type BestThirdCandidateByGroupEntry = {
  ready: boolean
  thirdCode: string
  thirdTeamName: string
}

function buildBestThirdCodesFromSelectedGroups(
  selectedGroupIds: Set<string>,
  candidatesByGroup: Map<string, BestThirdCandidateByGroupEntry>
): string[] {
  const nextCodes: string[] = []
  for (const groupId of GROUP_STAGE_GROUP_CODES) {
    if (!selectedGroupIds.has(groupId)) continue
    const candidate = candidatesByGroup.get(groupId)
    if (!candidate?.ready || !candidate.thirdCode) continue
    nextCodes.push(candidate.thirdCode)
    if (nextCodes.length >= BEST_THIRD_SLOTS) break
  }
  return normalizeBestThirds(nextCodes)
}

function getCompletionCount(
  groups: Record<string, GroupPrediction>,
  groupIds: string[],
  groupTeams: Record<string, Team[]>,
  allowTopTwoFallback = false
) {
  let complete = 0
  for (const groupId of groupIds) {
    const teamCodes = buildGroupTeamCodes(groupTeams[groupId] ?? [])
    const group = groups[groupId] ?? {}
    if (isStrictGroupRanking(group.ranking, teamCodes)) {
      complete += 1
      continue
    }

    if (allowTopTwoFallback) {
      const topTwo = resolveStoredTopTwo(group, teamCodes)
      if (topTwo.first && topTwo.second) {
        complete += 1
      }
    }
  }
  return complete
}

function normalizeRouteGroupId(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (!GROUP_ID_PATTERN.test(normalized)) return null
  return normalized
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeKey(viewerId)
  const seen = new Set<string>()
  const next: string[] = []
  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    if (!trimmed) continue
    const key = normalizeKey(trimmed)
    if (!key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
    if (next.length >= 3) break
  }
  return next
}

function getGroupJumpStatus(
  groupId: string,
  groups: Record<string, GroupPrediction>,
  groupTeams: Record<string, Team[]>,
  isLocked: boolean
): GroupJumpStatus {
  if (isLocked) return 'locked'
  const teamCodes = buildGroupTeamCodes(groupTeams[groupId] ?? [])
  const pick = groups[groupId] ?? {}
  if (isStrictGroupRanking(pick.ranking, teamCodes)) return 'complete'
  return 'incomplete'
}

function groupJumpStatusClass(status: GroupJumpStatus): string {
  if (status === 'locked') return 'border-[rgba(var(--warn-rgb),0.46)] text-foreground'
  if (status === 'complete') return 'border-[rgba(var(--primary-rgb),0.5)] text-foreground'
  return 'border-border text-muted-foreground'
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((value) => csvEscape(value)).join(',')).join('\n')
}

function downloadCsvFile(fileName: string, content: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  window.document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

export default function GroupStagePage() {
  // QA-SMOKE: route=/group-stage and /demo/group-stage ; checklist-id=smoke-group-stage-detail
  const navigate = useNavigate()
  const location = useLocation()
  const { groupId: routeGroupIdParam } = useParams<{ groupId?: string }>()
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const authState = useAuthState()
  const phaseState = useTournamentPhaseState()
  const { showToast } = useToast()
  const now = useNow({ tickMs: 30_000 })
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const isDesktopRailViewport = useMediaQuery('(min-width: 1024px)')
  const picksState = usePicksData()
  const publishedSnapshot = usePublishedSnapshot()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES
  const groupStage = useGroupStageData(matches)
  const [groupQualifierPoints, setGroupQualifierPoints] = useState(DEFAULT_GROUP_QUALIFIER_POINTS)
  const [selectedStandingsGroup, setSelectedStandingsGroup] = useState<string>('A')
  const [savingRowGroupId, setSavingRowGroupId] = useState<string | null>(null)
  const [savedRowGroupId, setSavedRowGroupId] = useState<string | null>(null)
  const savedRowTimerRef = useRef<number | null>(null)
  const [lastPersistedBestThirds, setLastPersistedBestThirds] = useState<string[]>([])
  const [bestThirdHelperText, setBestThirdHelperText] = useState<string | null>(null)
  const [bestThirdAnimatedGroupId, setBestThirdAnimatedGroupId] = useState<string | null>(null)
  const bestThirdHelperTimerRef = useRef<number | null>(null)
  const bestThirdAnimationTimerRef = useRef<number | null>(null)
  const selectedThirdCodeByGroupRef = useRef<Record<string, string>>({})
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])

  const groupRouteBase = mode === 'demo' ? '/demo/group-stage' : '/group-stage'
  const routeGroupId = useMemo(() => normalizeRouteGroupId(routeGroupIdParam), [routeGroupIdParam])

  useEffect(() => {
    const cleaned = stripLegacyGroupStageParams(location.search)
    if (cleaned === location.search) return
    navigate(
      {
        pathname: location.pathname,
        search: cleaned
      },
      { replace: true }
    )
  }, [location.pathname, location.search, navigate])

  const navigateToGroup = useCallback(
    (groupId: string, replace = false) => {
      if (!GROUP_ID_PATTERN.test(groupId)) return
      navigate(
        {
          pathname: `${groupRouteBase}/${groupId}`,
          search: location.search
        },
        { replace }
      )
    },
    [groupRouteBase, location.search, navigate]
  )

  useEffect(() => {
    if (routeGroupId) return
    navigateToGroup('A', true)
  }, [navigateToGroup, routeGroupId])

  useEffect(() => {
    let canceled = false

    async function loadRivals() {
      try {
        const profile = await readUserProfile(mode, viewerId, authState.user?.email ?? null)
        if (canceled) return
        setRivalUserIds(sanitizeRivalUserIds(profile.rivalUserIds, viewerId))
      } catch {
        if (!canceled) setRivalUserIds([])
      }
    }

    void loadRivals()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, mode, viewerId])

  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const groupIds = groupStage.groupIds
  const bestThirds = normalizeBestThirds(groupStage.data.bestThirds)
  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const snapshotMatches = snapshotReady?.matches ?? matches
  const standings = useMemo(() => buildGroupStandingsSnapshot(snapshotMatches), [snapshotMatches])
  const qualifiersSet = useMemo(
    () => new Set(snapshotReady?.bestThirdQualifiers ?? []),
    [snapshotReady?.bestThirdQualifiers]
  )
  const groupsFinal = groupIds.length > 0 && standings.completeGroups.size === groupIds.length
  const bestThirdsFinal = groupsFinal && (snapshotReady?.bestThirdQualifiers.length ?? 0) >= BEST_THIRD_SLOTS

  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosedByTime = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const groupClosed = groupClosedByTime || groupStage.isLocked
  const isFinalResultsMode = Boolean(snapshotReady?.groupStageComplete)
  const isReadOnly = groupClosed || isFinalResultsMode

  const bestThirdCandidatesByGroup = useMemo(() => {
    const next = new Map<string, BestThirdCandidateByGroupEntry>()

    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      const teams = groupTeams[groupId] ?? []
      const teamCodes = buildGroupTeamCodes(teams)
      const prediction = groupStage.data.groups[groupId] ?? {}
      const isStrict = isStrictGroupRanking(prediction.ranking, teamCodes)
      const ranking = isStrict ? buildGroupRankingForDisplay(prediction, teamCodes) : []
      const thirdCode = ranking[2] ?? ''
      let resolvedThirdCode = thirdCode

      if (!resolvedThirdCode && (isReadOnly || groupsFinal)) {
        const topTwo = resolveStoredTopTwo(prediction, teamCodes)
        const excluded = new Set([topTwo.first, topTwo.second].filter(Boolean))
        const standingsCodes = (standings.standingsByGroup.get(groupId) ?? []).map((entry) => entry.code)
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
  }, [groupStage.data.groups, groupTeams, groupsFinal, isReadOnly, standings.standingsByGroup])

  const selectedBestThirdGroups = useMemo(() => {
    const selectedCodes = new Set(normalizeTeamCodes(bestThirds))
    const selected = new Set<string>()
    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      const candidate = bestThirdCandidatesByGroup.get(groupId)
      if (!candidate?.ready || !candidate.thirdCode) continue
      if (selectedCodes.has(candidate.thirdCode)) {
        selected.add(groupId)
      }
    }
    return selected
  }, [bestThirdCandidatesByGroup, bestThirds])

  const selectedBestThirdCodes = useMemo(
    () => buildBestThirdCodesFromSelectedGroups(selectedBestThirdGroups, bestThirdCandidatesByGroup),
    [bestThirdCandidatesByGroup, selectedBestThirdGroups]
  )

  const selectedBestThirds = useMemo(() => normalizeTeamCodes(selectedBestThirdCodes), [selectedBestThirdCodes])
  const selectedBestThirdCount = selectedBestThirdGroups.size

  const completion = useMemo(() => {
    const groupsDone = getCompletionCount(groupStage.data.groups, groupIds, groupTeams, isReadOnly || groupsFinal)
    const bestThirdDone = selectedBestThirdCount
    return { groupsDone, bestThirdDone, bestThirdSelectionValid: selectedBestThirdCount === BEST_THIRD_SLOTS }
  }, [groupIds, groupStage.data.groups, groupTeams, groupsFinal, isReadOnly, selectedBestThirdCount])

  const bestThirdDirty = useMemo(() => {
    const baseline = normalizeBestThirds(lastPersistedBestThirds)
    const current = normalizeBestThirds(groupStage.data.bestThirds)
    for (let index = 0; index < BEST_THIRD_SLOTS; index += 1) {
      if ((baseline[index] ?? '') !== (current[index] ?? '')) return true
    }
    return false
  }, [groupStage.data.bestThirds, lastPersistedBestThirds])
  const isBestThirdMembershipCorrect = useMemo(() => {
    if (!bestThirdsFinal || !completion.bestThirdSelectionValid) return false
    const finalQualifiers = snapshotReady?.bestThirdQualifiers ?? []
    if (finalQualifiers.length !== BEST_THIRD_SLOTS || selectedBestThirds.length !== BEST_THIRD_SLOTS) return false
    const selectedSet = new Set(selectedBestThirds)
    return finalQualifiers.every((code) => selectedSet.has(code))
  }, [bestThirdsFinal, completion.bestThirdSelectionValid, selectedBestThirds, snapshotReady?.bestThirdQualifiers])
  const missingCorrectQualifiers = useMemo(() => {
    if (!bestThirdsFinal || isBestThirdMembershipCorrect) return []
    const selectedSet = new Set(selectedBestThirds)
    return (snapshotReady?.bestThirdQualifiers ?? []).filter((code) => !selectedSet.has(code))
  }, [bestThirdsFinal, isBestThirdMembershipCorrect, selectedBestThirds, snapshotReady?.bestThirdQualifiers])
  const shouldShowCorrectQualifiersStrip = bestThirdsFinal && !isBestThirdMembershipCorrect
  const scoringSnapshotTimestamp = snapshotReady?.snapshotTimestamp ?? ''

  const frozenLeaderboardRows = useMemo(() => {
    if (!snapshotReady) return []
    return buildLeaderboardPresentation({
      snapshotTimestamp: snapshotReady.snapshotTimestamp,
      groupStageComplete: snapshotReady.groupStageComplete,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      leaderboardRows: snapshotReady.leaderboardRows
    }).rows
  }, [snapshotReady])

  const projectedImpactRows = useMemo(() => {
    if (!snapshotReady) return []
    return buildProjectedImpactRows({
      frozenLeaderboardRows,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      currentUserId: viewerId
    })
  }, [frozenLeaderboardRows, snapshotReady, viewerId])

  const finalGroupStageRows = useMemo(() => {
    if (!snapshotReady) return []
    const pointsByUser = snapshotReady.projectedGroupStagePointsByUser
    const resolvePoints = (member: { id?: string }) => {
      const key = member.id?.trim().toLowerCase()
      if (!key) return 0
      const value = pointsByUser[key]
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    }
    return snapshotReady.leaderboardRows
      .map((entry) => ({
        entry,
        points: resolvePoints(entry.member)
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        return a.entry.member.name.localeCompare(b.entry.member.name)
      })
  }, [snapshotReady])

  const rows = useMemo<GroupStageDenseRow[]>(() => {
    return groupIds.map((groupId) => {
      const teams = groupTeams[groupId] ?? []
      const teamCodes = buildGroupTeamCodes(teams)
      const prediction = groupStage.data.groups[groupId] ?? {}
      const ranking = buildGroupRankingForDisplay(prediction, teamCodes)
      const topTwo = resolveStoredTopTwo(prediction, teamCodes)
      const complete = isStrictGroupRanking(prediction.ranking, teamCodes)
      const groupStandings = standings.standingsByGroup.get(groupId) ?? []
      const standingsComplete = standings.completeGroups.has(groupId)
      const actualTopTwo = groupStandings.slice(0, 2).map((entry) => entry.code)
      const finishedCount = standings.finishedMatchesByGroup.get(groupId) ?? 0
      const totalCount = standings.totalMatchesByGroup.get(groupId) ?? 0

      const firstResult = resolveGroupPlacementStatus(
        standingsComplete,
        groupClosedByTime,
        topTwo.first,
        actualTopTwo[0]
      )
      const secondResult = resolveGroupPlacementStatus(
        standingsComplete,
        groupClosedByTime,
        topTwo.second,
        actualTopTwo[1]
      )
      const rowResult = resolveGroupRowStatus(standingsComplete, groupClosedByTime, firstResult, secondResult)

      return {
        groupId,
        teams,
        prediction,
        ranking,
        rankingComplete: complete,
        complete: standingsComplete,
        actualTopTwo,
        finishedCount,
        totalCount,
        firstResult,
        secondResult,
        rowResult
      }
    })
  }, [
    groupIds,
    groupStage.data.groups,
    groupTeams,
    groupClosedByTime,
    standings.completeGroups,
    standings.finishedMatchesByGroup,
    standings.standingsByGroup,
    standings.totalMatchesByGroup
  ])
  const activeGroupId = routeGroupId ?? 'A'
  const rowsForActiveGroup = useMemo(
    () => rows.filter((row) => row.groupId === activeGroupId),
    [activeGroupId, rows]
  )
  const groupJumpStatuses = useMemo(() => {
    const statuses = new Map<string, GroupJumpStatus>()
    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      statuses.set(groupId, getGroupJumpStatus(groupId, groupStage.data.groups, groupTeams, groupClosed))
    }
    return statuses
  }, [groupClosed, groupStage.data.groups, groupTeams])

  const flashSavedGroup = useCallback((groupId: string) => {
    setSavedRowGroupId(groupId)
    if (savedRowTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(savedRowTimerRef.current)
    }
    if (typeof window === 'undefined') return
    savedRowTimerRef.current = window.setTimeout(() => {
      setSavedRowGroupId((current) => (current === groupId ? null : current))
    }, 2500)
  }, [])

  const handleRankingReorder = useCallback(
    (row: GroupStageDenseRow, ranking: string[]) => {
      if (isReadOnly) return

      const persist = async () => {
        setSavingRowGroupId(row.groupId)
        const result = await groupStage.saveGroupRanking(row.groupId, ranking)
        setSavingRowGroupId((current) => (current === row.groupId ? null : current))

        if (!result.ok) {
          showToast({
            tone: result.reason === 'locked' ? 'warning' : 'danger',
            title: result.reason === 'locked' ? 'Group stage locked' : 'Save failed',
            message:
              result.reason === 'locked'
                ? 'Post-lock edits are not allowed.'
                : 'Unable to save group ranking order.'
          })
          return
        }

        setLastPersistedBestThirds(normalizeBestThirds(result.bestThirds))
        if (!result.changed) return
        flashSavedGroup(row.groupId)
      }

      void persist()
    },
    [flashSavedGroup, groupStage, isReadOnly, showToast]
  )

  const handleBestThirdGroupToggle = useCallback(
    (groupId: string) => {
      if (isReadOnly) return
      const candidate = bestThirdCandidatesByGroup.get(groupId)
      if (!candidate?.ready || !candidate.thirdCode) return

      const nextSelected = new Set(selectedBestThirdGroups)
      if (nextSelected.has(groupId)) {
        nextSelected.delete(groupId)
      } else {
        if (nextSelected.size >= BEST_THIRD_SLOTS) return
        nextSelected.add(groupId)
      }

      const nextCodes = buildBestThirdCodesFromSelectedGroups(nextSelected, bestThirdCandidatesByGroup)
      groupStage.setBestThirds(nextCodes)
    },
    [bestThirdCandidatesByGroup, groupStage, isReadOnly, selectedBestThirdGroups]
  )

  const bestThirdTiles = useMemo<BestThirdGroupTile[]>(() => {
    const atCap = selectedBestThirdCount >= BEST_THIRD_SLOTS
    return GROUP_STAGE_GROUP_CODES.map((groupId) => {
      const candidate = bestThirdCandidatesByGroup.get(groupId)
      const selected = selectedBestThirdGroups.has(groupId)
      const ready = candidate?.ready ?? false
      const blockedReason = !ready ? 'not-ready' : !selected && atCap ? 'cap' : null
      const thirdCode = candidate?.thirdCode ?? ''

      return {
        groupId,
        teamCode: thirdCode,
        teamName: candidate?.thirdTeamName ?? '',
        selected,
        disabled: Boolean(blockedReason),
        blockedReason,
        status: resolveBestThirdStatus(
          bestThirdsFinal,
          groupClosedByTime,
          completion.bestThirdSelectionValid,
          selected ? thirdCode : undefined,
          qualifiersSet
        ),
        animateSelection: bestThirdAnimatedGroupId === groupId
      }
    })
  }, [
    bestThirdAnimatedGroupId,
    bestThirdCandidatesByGroup,
    bestThirdsFinal,
    completion.bestThirdSelectionValid,
    groupClosedByTime,
    qualifiersSet,
    selectedBestThirdCount,
    selectedBestThirdGroups
  ])

  const bestThirdMeterLabel = `Third-place qualifiers: ${selectedBestThirdCount} / ${BEST_THIRD_SLOTS} selected`
  const bestThirdHintLabel =
    selectedBestThirdCount < BEST_THIRD_SLOTS ? `${BEST_THIRD_SLOTS - selectedBestThirdCount} more left` : 'All set'

  const selectedThirdCodeByGroup = useMemo(() => {
    const next: Record<string, string> = {}
    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      if (!selectedBestThirdGroups.has(groupId)) continue
      const thirdCode = bestThirdCandidatesByGroup.get(groupId)?.thirdCode ?? ''
      if (!thirdCode) continue
      next[groupId] = thirdCode
    }
    return next
  }, [bestThirdCandidatesByGroup, selectedBestThirdGroups])

  useEffect(() => {
    setSelectedStandingsGroup(routeGroupId ?? 'A')
  }, [routeGroupId])

  useEffect(() => {
    if (groupStage.loadState.status !== 'ready') return
    setLastPersistedBestThirds(normalizeBestThirds(groupStage.data.bestThirds))
  }, [groupStage.loadState.status, mode])

  useEffect(() => {
    const previous = selectedThirdCodeByGroupRef.current
    let changedGroupId: string | null = null

    for (const [groupId, code] of Object.entries(selectedThirdCodeByGroup)) {
      const previousCode = previous[groupId]
      if (previousCode && previousCode !== code) {
        changedGroupId = groupId
        break
      }
    }

    selectedThirdCodeByGroupRef.current = selectedThirdCodeByGroup
    if (!changedGroupId) return

    setBestThirdHelperText(`Selection stays with Group ${changedGroupId}`)
    setBestThirdAnimatedGroupId(changedGroupId)

    if (typeof window === 'undefined') return
    if (bestThirdHelperTimerRef.current !== null) {
      window.clearTimeout(bestThirdHelperTimerRef.current)
    }
    if (bestThirdAnimationTimerRef.current !== null) {
      window.clearTimeout(bestThirdAnimationTimerRef.current)
    }

    bestThirdHelperTimerRef.current = window.setTimeout(() => {
      setBestThirdHelperText((current) =>
        current === `Selection stays with Group ${changedGroupId}` ? null : current
      )
    }, 2600)
    bestThirdAnimationTimerRef.current = window.setTimeout(() => {
      setBestThirdAnimatedGroupId((current) => (current === changedGroupId ? null : current))
    }, 1100)
  }, [selectedThirdCodeByGroup])

  useEffect(() => {
    return () => {
      if (savedRowTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(savedRowTimerRef.current)
      }
      if (bestThirdHelperTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(bestThirdHelperTimerRef.current)
      }
      if (bestThirdAnimationTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(bestThirdAnimationTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let canceled = false
    async function loadScoringConfig() {
      try {
        const scoring = await fetchScoring({ mode })
        if (!canceled) {
          setGroupQualifierPoints(scoring.bracket.groupQualifiers ?? DEFAULT_GROUP_QUALIFIER_POINTS)
        }
      } catch {
        if (!canceled) setGroupQualifierPoints(DEFAULT_GROUP_QUALIFIER_POINTS)
      }
    }
    void loadScoringConfig()
    return () => {
      canceled = true
    }
  }, [mode])

  useEffect(() => {
    if (!isReadOnly) return
    setSavingRowGroupId(null)
  }, [isReadOnly])

  const leaderboardRowsForCard = useMemo<LeaderboardCardRow[]>(() => {
    const sectionRows = (isFinalResultsMode
      ? finalGroupStageRows.map((row) => ({
          id: row.entry.member.id || row.entry.member.name,
          name: row.entry.member.name,
          points: row.points,
          movement: undefined as number | undefined,
          deltaPoints: undefined as number | undefined,
          isYou: normalizeKey(row.entry.member.id) === normalizeKey(viewerId)
        }))
      : projectedImpactRows
      .map((row) => {
        const basePoints = frozenLeaderboardRows[row.baseRank - 1]?.totalPoints ?? 0
        return {
          id: row.userId,
          name: row.name,
          points: basePoints + row.deltaPoints,
          movement: row.deltaRank,
          deltaPoints: row.deltaPoints,
          isYou: row.isYou
        }
      }))

    const ranked = rankRowsWithTiePriority({
      rows: sectionRows,
      getPoints: (row) => row.points,
      getIdentityKeys: (row) => [row.id],
      getName: (row) => row.name,
      viewerIdentity: viewerId,
      rivalIdentities: rivalUserIds
    })

    return ranked.rankedRows.map(({ row, rank }) => ({
      id: row.id,
      name: row.name,
      rank,
      points: row.points,
      movement: row.movement,
      deltaPoints: row.deltaPoints,
      isYou: row.isYou
    }))
  }, [finalGroupStageRows, frozenLeaderboardRows, isFinalResultsMode, projectedImpactRows, rivalUserIds, viewerId])

  const selectedGroupPrediction = groupStage.data.groups[selectedStandingsGroup] ?? {}
  const selectedGroupTeamCodes = buildGroupTeamCodes(groupTeams[selectedStandingsGroup] ?? [])
  const selectedGroupTopTwo = resolveStoredTopTwo(selectedGroupPrediction, selectedGroupTeamCodes)
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible
  const homePath = mode === 'demo' ? '/demo' : '/'
  const leaderboardPath = mode === 'demo' ? '/demo/leaderboard' : '/leaderboard'
  const scoringSnapshotLabel = formatSnapshotTimestamp(scoringSnapshotTimestamp)
  const groupLockLabel = groupLockTime ? formatUtcAndLocalDeadline(groupLockTime.toISOString()) : 'Lock deadline unavailable'

  const saveBestThirdSelections = useCallback(async () => {
    const result = await groupStage.save()
    showToast({
      tone: result.ok ? 'success' : result.reason === 'locked' ? 'warning' : 'danger',
      title: result.ok
        ? 'Best-third picks saved'
        : result.reason === 'locked'
          ? 'Group stage locked'
          : 'Save failed',
      message: result.ok
        ? 'Best-third picks were saved.'
        : result.reason === 'locked'
          ? 'Post-lock edits are not allowed.'
          : 'Unable to save best-third picks.'
    })
    if (result.ok) {
      setLastPersistedBestThirds(normalizeBestThirds(groupStage.data.bestThirds))
    }
  }, [groupStage, showToast])

  const handleDownloadGroupStageCsv = useCallback(() => {
    const exportedAt = new Date().toISOString()
    const snapshotAsOf = snapshotReady?.snapshotTimestamp ?? ''
    const rows: string[][] = [
      ['exportedAt', exportedAt],
      ['snapshotAsOf', snapshotAsOf || 'Snapshot unavailable'],
      ['viewerUserId', viewerId],
      ['mode', mode === 'demo' ? 'demo' : 'prod'],
      [],
      ['groupId', 'rank1', 'rank2', 'rank3', 'rank4']
    ]

    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      const prediction = groupStage.data.groups[groupId] ?? {}
      const teamCodes = buildGroupTeamCodes(groupTeams[groupId] ?? [])
      const topTwo = resolveStoredTopTwo(prediction, teamCodes)
      const ranking = isStrictGroupRanking(prediction.ranking, teamCodes)
        ? buildGroupRankingForDisplay(prediction, teamCodes)
        : []
      rows.push([
        groupId,
        topTwo.first ?? '',
        topTwo.second ?? '',
        ranking[2] ?? '',
        ranking[3] ?? ''
      ])
    }

    rows.push([])
    rows.push(['bestThirdSlot', 'teamCode'])
    for (let index = 0; index < BEST_THIRD_SLOTS; index += 1) {
      rows.push([String(index + 1), bestThirds[index] ?? ''])
    }

    const safeViewerId = viewerId.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const stamp = exportedAt.replace(/[:.]/g, '-')
    const fileName = `group-stage-${safeViewerId || 'viewer'}-${stamp}.csv`
    downloadCsvFile(fileName, rowsToCsv(rows))
  }, [bestThirds, groupStage.data.groups, groupTeams, mode, snapshotReady?.snapshotTimestamp, viewerId])

  if (
    picksState.state.status === 'loading' ||
    groupStage.loadState.status === 'loading' ||
    publishedSnapshot.state.status === 'loading'
  ) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-10 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {picksState.state.message}
      </Alert>
    )
  }

  if (groupStage.loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {groupStage.loadState.message}
      </Alert>
    )
  }

  if (publishedSnapshot.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load published snapshot">
        {publishedSnapshot.state.message}
      </Alert>
    )
  }

  const groupPicksAlert =
    groupStage.saveStatus === 'locked' ? (
      <Alert tone="warning" title="Lock enforced">
        Group-stage edits are blocked after lock.
      </Alert>
    ) : null

  const groupPicksTable = (
    <GroupPicksDenseTable
      rows={rowsForActiveGroup}
      groupsDone={completion.groupsDone}
      groupsTotal={groupIds.length}
      isReadOnly={isReadOnly}
      groupQualifierPoints={groupQualifierPoints}
      saveStatus={groupStage.saveStatus}
      savingRowGroupId={savingRowGroupId}
      savedRowGroupId={savedRowGroupId}
      onRankingReorder={handleRankingReorder}
    />
  )

  const bestThirdPanel = (
    <BestThirdPicksCompact
      tiles={bestThirdTiles}
      selectedCount={selectedBestThirdCount}
      totalCount={BEST_THIRD_SLOTS}
      meterLabel={bestThirdMeterLabel}
      hintLabel={bestThirdHintLabel}
      helperText={bestThirdHelperText}
      statusLabel={bestThirdsFinal ? 'Final' : groupClosedByTime ? 'Locked' : null}
      defaultCollapsed={false}
      isReadOnly={isReadOnly}
      isDirty={bestThirdDirty}
      saveStatus={groupStage.saveStatus}
      warning={
        shouldShowCorrectQualifiersStrip ? (
          missingCorrectQualifiers.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {missingCorrectQualifiers.map((teamCode) => (
                <Badge
                  key={`missing-qualifier-${teamCode}`}
                  tone="warning"
                  className="px-2 py-0 text-[11px] normal-case tracking-normal"
                  title="Correct qualifier not selected"
                >
                  <TeamFlagLabelV2 code={teamCode} label={teamCode} size="xs" />
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground">Selection does not match final qualifiers.</div>
          )
        ) : undefined
      }
      onToggleGroup={handleBestThirdGroupToggle}
      onSave={() => {
        void saveBestThirdSelections()
      }}
    />
  )

  const standingsPanel = (
    <SectionCardV2 tone="panel" density="none" className="group-stage-v2-standings min-h-0 rounded-xl overflow-hidden">
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="text-[13px] font-semibold tracking-[0.02em] text-foreground">Standings</div>
        <Badge tone="secondary" className="h-7 rounded-full px-2 text-[12px] normal-case tracking-normal">
          Group {selectedStandingsGroup}
        </Badge>
      </div>

      <div className="min-h-0 overflow-auto p-3">
        <Table
          unframed
          className="[&_th]:h-9 [&_th]:px-2 [&_th]:py-0 [&_th]:text-[12px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:h-10 [&_td]:px-2 [&_td]:py-0 [&_td]:text-[14px]"
        >
          <thead>
            <tr>
              <th>Team</th>
              <th>Pts</th>
              <th>GD</th>
              <th>GF</th>
            </tr>
          </thead>
          <tbody>
            {(standings.standingsByGroup.get(selectedStandingsGroup) ?? []).map((entry) => {
              const pickedFirst = selectedGroupTopTwo.first === entry.code
              const pickedSecond = selectedGroupTopTwo.second === entry.code
              return (
                <tr
                  key={`group-standing-${selectedStandingsGroup}-${entry.code}`}
                  className={cn(
                    pickedFirst || pickedSecond
                      ? 'bg-background/80 ring-1 ring-border'
                      : 'hover:bg-background/45 transition-colors'
                  )}
                >
                  <td>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <TeamFlagLabelV2 code={entry.code} label={entry.code} />
                      {pickedFirst ? <Badge tone="info" className="px-1.5 py-0 text-[11px] normal-case tracking-normal">Your 1st</Badge> : null}
                      {pickedSecond ? <Badge tone="secondary" className="px-1.5 py-0 text-[11px] normal-case tracking-normal">Your 2nd</Badge> : null}
                    </div>
                  </td>
                  <td>{entry.points}</td>
                  <td>{entry.gd}</td>
                  <td>{entry.gf}</td>
                </tr>
              )
            })}
            {(standings.standingsByGroup.get(selectedStandingsGroup) ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-[13px] text-muted-foreground">
                  No standings data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </SectionCardV2>
  )

  const statusLineCopy =
    groupsFinal || isFinalResultsMode
      ? `Group stage is final and read-only. Lock deadline: ${groupLockLabel}.`
      : isReadOnly
        ? `Group stage is locked. Edits are no longer allowed. Lock deadline: ${groupLockLabel}.`
        : `Group stage is editable until ${groupLockLabel}.`

  const projectedLeaderboardCard = (
    <LeaderboardCardCurated
      rows={leaderboardRowsForCard}
      snapshotLabel={scoringSnapshotLabel}
      topCount={3}
      title={isFinalResultsMode ? 'Final Leaderboard (Group Stage)' : 'Projected Leaderboard'}
      leaderboardPath={leaderboardPath}
      previewRowCount={isDesktopRailViewport ? DESKTOP_PREVIEW_ROW_COUNT : undefined}
      priorityUserIds={rivalUserIds}
    />
  )

  return (
    <PageShellV2 className="group-stage-v2-canvas p-4">
      <PageHeaderV2
        variant="hero"
        className="group-stage-v2-hero"
        kicker="Your move"
        title="Group Stage"
        subtitle="Set your group ranking and best-third qualifiers. Updates publish on daily snapshots."
        actions={(
          <div className="flex items-center gap-2">
            <ButtonLink to={homePath} size="sm" variant="secondary">
              Back to Play Center
            </ButtonLink>
            {showExportMenu ? (
              <ExportMenuV2
                scopeLabel="Group rankings + best-third selections (you only)"
                snapshotLabel={formatSnapshotTimestamp(scoringSnapshotTimestamp)}
                lockMessage="Post-lock exports only. CSV format."
                onDownloadCsv={handleDownloadGroupStageCsv}
              />
            ) : null}
          </div>
        )}
        metadataClassName="w-full"
        metadata={<span className="block w-full">{statusLineCopy}</span>}
      />

      <SectionCardV2 tone="panel" density="none" className="group-stage-v2-group-nav sticky top-0 z-20 rounded-xl px-2 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="shrink-0 px-2 text-[13px] font-medium text-muted-foreground">Groups</div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2 pr-1">
              {GROUP_STAGE_GROUP_CODES.map((groupId) => {
                const status = groupJumpStatuses.get(groupId) ?? 'incomplete'
                return (
                  <Button
                    key={`group-pill-${groupId}`}
                    size="sm"
                    variant={groupId === activeGroupId ? 'primary' : 'secondary'}
                    className={cn(
                      'h-9 rounded-full px-3 text-[13px]',
                      groupId !== activeGroupId ? groupJumpStatusClass(status) : undefined
                    )}
                    onClick={() => navigateToGroup(groupId)}
                  >
                    {groupId}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      </SectionCardV2>

      {isDesktopRailViewport ? (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
          <div className="min-w-0 space-y-2.5">
            {groupPicksAlert}
            {groupPicksTable}
          </div>
          <div className="min-w-0">{standingsPanel}</div>
          <div className="min-w-0">{bestThirdPanel}</div>
          <div className="min-w-0">{projectedLeaderboardCard}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="space-y-2.5">
            {groupPicksAlert}
            {groupPicksTable}
          </div>
          {bestThirdPanel}
          {standingsPanel}
          {projectedLeaderboardCard}
        </div>
      )}
    </PageShellV2>
  )
}
