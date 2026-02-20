import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import {
  BEST_THIRD_SLOT_COUNT,
  buildGroupStandingsSnapshot,
  hasExactBestThirdSelection,
  normalizeTeamCodes,
  resolveBestThirdStatus,
  resolveGroupPlacementStatus,
  resolveGroupRowStatus
} from '../../lib/groupStageSnapshot'
import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import V2Card from '../components/v2/V2Card'
import {
  BestThirdPicksCompact,
  DashboardToolbar,
  GroupPicksDenseTable,
  LeaderboardCardCurated,
  RightRailSticky,
  StatusBar,
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
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { formatUtcAndLocalDeadline } from '../lib/deadline'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { cn } from '../lib/utils'
import {
  GROUP_STAGE_GROUP_CODES,
  patchGroupStageSearch,
  readGroupStageQueryState,
  stripLegacyGroupStageParams,
  type GroupStageQueryState
} from '../lib/groupStageFilters'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { buildProjectedImpactRows } from '../lib/projectedImpact'

const BEST_THIRD_SLOTS = BEST_THIRD_SLOT_COUNT
const DEFAULT_GROUP_QUALIFIER_POINTS = 3
const EMPTY_MATCHES: Match[] = []
const GROUP_ID_PATTERN = /^[A-L]$/

type RowDraft = {
  first: string
  second: string
}

type GroupJumpStatus = 'complete' | 'incomplete' | 'locked'

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

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

function getCompletionCount(groups: Record<string, GroupPrediction>, groupIds: string[]) {
  let complete = 0
  for (const groupId of groupIds) {
    const group = groups[groupId] ?? {}
    if (group.first && group.second && group.first !== group.second) {
      complete += 1
    }
  }
  return complete
}

function formatTeam(code: string | undefined, teams: Team[]): string {
  if (!code) return '—'
  const team = teams.find((entry) => entry.code === code)
  return team ? `${team.code} · ${team.name}` : code
}

function normalizeRouteGroupId(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (!GROUP_ID_PATTERN.test(normalized)) return null
  return normalized
}

function getGroupJumpStatus(
  groupId: string,
  groups: Record<string, GroupPrediction>,
  isLocked: boolean
): GroupJumpStatus {
  if (isLocked) return 'locked'
  const pick = groups[groupId] ?? {}
  if (pick.first && pick.second && pick.first !== pick.second) return 'complete'
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
  // QA-SMOKE: route=/play/group-stage and /demo/play/group-stage ; checklist-id=smoke-group-stage-detail
  const navigate = useNavigate()
  const location = useLocation()
  const { groupId: routeGroupIdParam } = useParams<{ groupId?: string }>()
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const phaseState = useTournamentPhaseState()
  const { showToast } = useToast()
  const now = useNow({ tickMs: 30_000 })
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const picksState = usePicksData()
  const publishedSnapshot = usePublishedSnapshot()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES
  const groupStage = useGroupStageData(matches)
  const [groupQualifierPoints, setGroupQualifierPoints] = useState(DEFAULT_GROUP_QUALIFIER_POINTS)
  const [selectedStandingsGroup, setSelectedStandingsGroup] = useState<string>('A')
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({})
  const [savedRowGroupId, setSavedRowGroupId] = useState<string | null>(null)
  const savedRowTimerRef = useRef<number | null>(null)
  const [lastPersistedBestThirds, setLastPersistedBestThirds] = useState<string[]>([])

  const queryState = useMemo(() => readGroupStageQueryState(location.search), [location.search])
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

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks') =>
    segment ? `${playRoot}/${segment}` : playRoot

  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const allTeams = useMemo(() => Object.values(groupTeams).flat(), [groupTeams])
  const groupIds = groupStage.groupIds
  const bestThirds = normalizeBestThirds(groupStage.data.bestThirds)
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosedByTime = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const groupClosed = groupClosedByTime || groupStage.isLocked
  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const isFinalResultsMode = Boolean(snapshotReady?.groupStageComplete)
  const isReadOnly = groupClosed || isFinalResultsMode

  const completion = useMemo(() => {
    const groupsDone = getCompletionCount(groupStage.data.groups, groupIds)
    const bestThirdDone = normalizeTeamCodes(bestThirds).length
    return { groupsDone, bestThirdDone, bestThirdSelectionValid: hasExactBestThirdSelection(bestThirds) }
  }, [bestThirds, groupIds, groupStage.data.groups])

  const snapshotMatches = snapshotReady?.matches ?? matches
  const standings = useMemo(() => buildGroupStandingsSnapshot(snapshotMatches), [snapshotMatches])
  const qualifiersSet = useMemo(
    () => new Set(snapshotReady?.bestThirdQualifiers ?? []),
    [snapshotReady?.bestThirdQualifiers]
  )
  const groupsFinal = groupIds.length > 0 && standings.completeGroups.size === groupIds.length
  const bestThirdsFinal = groupsFinal && (snapshotReady?.bestThirdQualifiers.length ?? 0) >= BEST_THIRD_SLOTS
  const selectedBestThirds = useMemo(() => normalizeTeamCodes(bestThirds), [bestThirds])
  const selectedBestThirdCount = selectedBestThirds.length
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

  const tableStatusLabel = groupsFinal ? 'Final' : 'Pending'
  const pointsContextLabel = groupsFinal ? 'Final points' : 'Potential points'

  const rows = useMemo<GroupStageDenseRow[]>(() => {
    return groupIds.map((groupId) => {
      const teams = groupTeams[groupId] ?? []
      const prediction = groupStage.data.groups[groupId] ?? {}
      const groupStandings = standings.standingsByGroup.get(groupId) ?? []
      const complete = standings.completeGroups.has(groupId)
      const actualTopTwo = groupStandings.slice(0, 2).map((entry) => entry.code)
      const finishedCount = standings.finishedMatchesByGroup.get(groupId) ?? 0
      const totalCount = standings.totalMatchesByGroup.get(groupId) ?? 0

      const firstResult = resolveGroupPlacementStatus(complete, groupClosedByTime, prediction.first, actualTopTwo[0])
      const secondResult = resolveGroupPlacementStatus(complete, groupClosedByTime, prediction.second, actualTopTwo[1])
      const rowResult = resolveGroupRowStatus(complete, groupClosedByTime, firstResult, secondResult)

      return {
        groupId,
        teams,
        prediction,
        complete,
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
      statuses.set(groupId, getGroupJumpStatus(groupId, groupStage.data.groups, groupClosed))
    }
    return statuses
  }, [groupClosed, groupStage.data.groups])

  const hasUnsavedRowDrafts = useMemo(() => {
    for (const [groupId, draft] of Object.entries(rowDrafts)) {
      const persisted = groupStage.data.groups[groupId] ?? {}
      if ((persisted.first ?? '') !== draft.first || (persisted.second ?? '') !== draft.second) {
        return true
      }
    }
    return false
  }, [groupStage.data.groups, rowDrafts])

  const discardRowDrafts = useCallback(() => {
    setRowDrafts({})
  }, [])

  const discardRowDraft = useCallback((groupId: string) => {
    setRowDrafts((current) => {
      if (!current[groupId]) return current
      const next = { ...current }
      delete next[groupId]
      return next
    })
  }, [])

  const confirmDiscardRowDrafts = useCallback(() => {
    if (!hasUnsavedRowDrafts) return true
    if (typeof window === 'undefined') return true
    const shouldDiscard = window.confirm('Discard unsaved inline edits?')
    if (!shouldDiscard) return false
    discardRowDrafts()
    return true
  }, [discardRowDrafts, hasUnsavedRowDrafts])

  const updateQueryState = useCallback(
    (patch: Partial<GroupStageQueryState>) => {
      const nextSearch = patchGroupStageSearch(location.search, patch)
      if (nextSearch === location.search) return
      if (!confirmDiscardRowDrafts()) return
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch
        },
        { replace: false }
      )
    },
    [confirmDiscardRowDrafts, location.pathname, location.search, navigate]
  )

  const handleRowPickChange = useCallback(
    (row: GroupStageDenseRow, field: 'first' | 'second', value: string) => {
      if (isReadOnly) return
      const persisted = groupStage.data.groups[row.groupId] ?? {}
      const persistedFirst = persisted.first ?? ''
      const persistedSecond = persisted.second ?? ''

      setRowDrafts((current) => {
        const baseline = current[row.groupId] ?? {
          first: persistedFirst,
          second: persistedSecond
        }
        const nextDraft = {
          ...baseline
        }

        if (field === 'first') {
          nextDraft.first = value
          if (nextDraft.second && nextDraft.second === value) nextDraft.second = ''
        } else {
          nextDraft.second = value
          if (nextDraft.first && nextDraft.first === value) nextDraft.first = ''
        }

        const unchanged = nextDraft.first === persistedFirst && nextDraft.second === persistedSecond
        if (unchanged) {
          if (!current[row.groupId]) return current
          const next = { ...current }
          delete next[row.groupId]
          return next
        }

        return {
          ...current,
          [row.groupId]: nextDraft
        }
      })
    },
    [groupStage.data.groups, isReadOnly]
  )

  const saveRowDraft = useCallback(
    async (row: GroupStageDenseRow) => {
      if (isReadOnly) return false
      const draft = rowDrafts[row.groupId]
      if (!draft) return false
      const rowIsValid = Boolean(draft.first) && Boolean(draft.second) && draft.first !== draft.second
      if (!rowIsValid) return false

      const updatedGroups = {
        ...groupStage.data.groups,
        [row.groupId]: {
          ...(groupStage.data.groups[row.groupId] ?? {}),
          first: draft.first || undefined,
          second: draft.second || undefined
        }
      }

      const result = await groupStage.save({
        ...groupStage.data,
        groups: updatedGroups,
        updatedAt: new Date().toISOString()
      })

      showToast({
        tone: result.ok ? 'success' : result.reason === 'locked' ? 'warning' : 'danger',
        title: result.ok ? `Group ${row.groupId} saved` : result.reason === 'locked' ? 'Group stage locked' : 'Save failed',
        message: result.ok
          ? 'Inline group edits were saved.'
          : result.reason === 'locked'
            ? 'Post-lock edits are not allowed.'
            : 'Unable to save inline group edits.'
      })

      if (result.ok) {
        discardRowDraft(row.groupId)
        setLastPersistedBestThirds(normalizeBestThirds(groupStage.data.bestThirds))
        setSavedRowGroupId(row.groupId)
        if (savedRowTimerRef.current !== null && typeof window !== 'undefined') {
          window.clearTimeout(savedRowTimerRef.current)
        }
        if (typeof window !== 'undefined') {
          savedRowTimerRef.current = window.setTimeout(() => {
            setSavedRowGroupId((current) => (current === row.groupId ? null : current))
          }, 2500)
        }
      }
      return result.ok
    },
    [discardRowDraft, groupStage, isReadOnly, rowDrafts, showToast]
  )

  const bestThirdCandidatesForIndex = useMemo(
    () => (index: number) => {
      const excludedTopTwo = new Set<string>()
      for (const groupId of groupIds) {
        const pick = groupStage.data.groups[groupId] ?? {}
        if (pick.first) excludedTopTwo.add(pick.first)
        if (pick.second) excludedTopTwo.add(pick.second)
      }
      const selectedElsewhere = new Set(
        groupStage.data.bestThirds
          .map((team, idx) => ({ team, idx }))
          .filter((entry) => entry.idx !== index && Boolean(entry.team))
          .map((entry) => entry.team)
      )
      return allTeams.filter((team) => !excludedTopTwo.has(team.code) && !selectedElsewhere.has(team.code))
    },
    [allTeams, groupIds, groupStage.data.bestThirds, groupStage.data.groups]
  )

  useEffect(() => {
    setSelectedStandingsGroup(routeGroupId ?? 'A')
  }, [routeGroupId])

  useEffect(() => {
    if (groupStage.loadState.status !== 'ready') return
    setLastPersistedBestThirds(normalizeBestThirds(groupStage.data.bestThirds))
  }, [groupStage.loadState.status, mode])

  useEffect(() => {
    return () => {
      if (savedRowTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(savedRowTimerRef.current)
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
    if (isReadOnly) {
      discardRowDrafts()
      return
    }

    setRowDrafts((current) => {
      let changed = false
      const next: Record<string, RowDraft> = {}
      for (const [groupId, draft] of Object.entries(current)) {
        if (!groupIds.includes(groupId)) {
          changed = true
          continue
        }
        const persisted = groupStage.data.groups[groupId] ?? {}
        const unchanged = (persisted.first ?? '') === draft.first && (persisted.second ?? '') === draft.second
        if (unchanged) {
          changed = true
          continue
        }
        next[groupId] = draft
      }
      return changed ? next : current
    })
  }, [discardRowDrafts, groupIds, groupStage.data.groups, isReadOnly])

  const bestThirdSlots = useMemo(() => {
    return bestThirds.map((teamCode, index) => ({
      index,
      code: teamCode ?? '',
      status: resolveBestThirdStatus(
        bestThirdsFinal,
        groupClosedByTime,
        completion.bestThirdSelectionValid,
        teamCode,
        qualifiersSet
      ),
      options: bestThirdCandidatesForIndex(index)
    }))
  }, [
    bestThirdCandidatesForIndex,
    bestThirds,
    bestThirdsFinal,
    completion.bestThirdSelectionValid,
    groupClosedByTime,
    qualifiersSet
  ])

  const resolveTeamLabel = useCallback((code: string | undefined) => formatTeam(code, allTeams), [allTeams])

  const leaderboardRowsForCard = useMemo<LeaderboardCardRow[]>(() => {
    if (isFinalResultsMode) {
      return finalGroupStageRows.map((row, index) => {
        const key = row.entry.member.id?.trim().toLowerCase() ?? ''
        return {
          id: row.entry.member.id || row.entry.member.name,
          name: row.entry.member.name,
          rank: index + 1,
          points: row.points,
          isYou: key.length > 0 && key === viewerId.trim().toLowerCase()
        }
      })
    }

    return projectedImpactRows
      .map((row) => {
        const basePoints = frozenLeaderboardRows[row.baseRank - 1]?.totalPoints ?? 0
        return {
          id: row.userId,
          name: row.name,
          rank: row.projectedRank,
          points: basePoints + row.deltaPoints,
          movement: row.deltaRank,
          deltaPoints: row.deltaPoints,
          isYou: row.isYou
        }
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        return a.name.localeCompare(b.name)
      })
  }, [finalGroupStageRows, frozenLeaderboardRows, isFinalResultsMode, projectedImpactRows, viewerId])

  const selectedGroupPrediction = groupStage.data.groups[selectedStandingsGroup] ?? {}
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible

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
      ['groupId', 'first', 'second']
    ]

    for (const groupId of GROUP_STAGE_GROUP_CODES) {
      const prediction = groupStage.data.groups[groupId] ?? {}
      rows.push([groupId, prediction.first ?? '', prediction.second ?? ''])
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
  }, [bestThirds, groupStage.data.groups, mode, snapshotReady?.snapshotTimestamp, viewerId])

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
      showPoints={queryState.points === 'on'}
      isReadOnly={isReadOnly}
      groupClosedByTime={groupClosedByTime}
      groupQualifierPoints={groupQualifierPoints}
      tableStatusLabel={tableStatusLabel}
      pointsContextLabel={pointsContextLabel}
      saveStatus={groupStage.saveStatus}
      savedRowGroupId={savedRowGroupId}
      rowDrafts={rowDrafts}
      onTogglePoints={() => updateQueryState({ points: queryState.points === 'on' ? 'off' : 'on' })}
      onPickChange={handleRowPickChange}
      onRowSave={(row) => {
        void saveRowDraft(row)
      }}
      onRowCancel={discardRowDraft}
    />
  )

  const bestThirdPanel = (
    <BestThirdPicksCompact
      slots={bestThirdSlots}
      selectedCount={selectedBestThirdCount}
      totalCount={BEST_THIRD_SLOTS}
      selectedCodes={selectedBestThirds}
      statusLabel={bestThirdsFinal ? 'Final' : groupClosedByTime ? 'Locked' : 'Pending'}
      defaultCollapsed={false}
      isReadOnly={isReadOnly}
      isDirty={bestThirdDirty}
      saveStatus={groupStage.saveStatus}
      warning={
        shouldShowCorrectQualifiersStrip ? (
          <Alert tone="warning" title="Correct qualifiers">
            {missingCorrectQualifiers.length > 0
              ? `You did not select: ${missingCorrectQualifiers.join(', ')}`
              : 'Your selection does not match the final qualifiers set.'}
          </Alert>
        ) : undefined
      }
      resolveTeamLabel={resolveTeamLabel}
      onSlotChange={(index, value) => groupStage.setBestThird(index, value)}
      onSave={() => {
        void saveBestThirdSelections()
      }}
    />
  )

  const standingsPanel = (
    <V2Card className="min-h-0 rounded-xl overflow-hidden">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Standings</div>
        <Badge tone="secondary" className="h-7 rounded-full px-2 text-[11px] normal-case tracking-normal">
          Group {selectedStandingsGroup}
        </Badge>
      </div>

      <div className="min-h-0 overflow-auto p-3">
        <Table
          unframed
          className="[&_th]:h-8 [&_th]:px-2 [&_th]:py-0 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:h-9 [&_td]:px-2 [&_td]:py-0 [&_td]:text-[12px]"
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
              const pickedFirst = selectedGroupPrediction.first === entry.code
              const pickedSecond = selectedGroupPrediction.second === entry.code
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
                      <span className="truncate">{entry.code}</span>
                      {pickedFirst ? <Badge tone="info" className="px-1 py-0 text-[9px] tracking-[0.12em]">Your 1st</Badge> : null}
                      {pickedSecond ? <Badge tone="secondary" className="px-1 py-0 text-[9px] tracking-[0.12em]">Your 2nd</Badge> : null}
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
                <td colSpan={4} className="text-center text-[12px] text-muted-foreground">
                  No standings data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </div>
    </V2Card>
  )

  return (
    <div className="w-full">
      <div className="flex w-full flex-col gap-3 p-3 sm:p-4 xl:p-5">
        <DashboardToolbar
          playCenterPath={toPlayPath()}
          leaderboardPath={`${playRoot}/league`}
          picksLastSavedLabel={formatTime(groupStage.data.updatedAt)}
          scoringSnapshotLabel={formatSnapshotTimestamp(scoringSnapshotTimestamp)}
        />

        <StatusBar
          groupsDone={completion.groupsDone}
          groupsTotal={groupIds.length}
          bestThirdDone={completion.bestThirdDone}
          bestThirdTotal={BEST_THIRD_SLOTS}
          closesLabel={formatUtcAndLocalDeadline(groupLockTime?.toISOString())}
          stateLabel={groupsFinal ? 'Final' : 'Pending'}
        />

        <V2Card className="sticky top-0 z-20 rounded-xl px-2 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="shrink-0 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">Groups</div>
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex min-w-max items-center gap-1.5 pr-1">
                {GROUP_STAGE_GROUP_CODES.map((groupId) => {
                  const status = groupJumpStatuses.get(groupId) ?? 'incomplete'
                  return (
                    <Button
                      key={`group-pill-${groupId}`}
                      size="sm"
                      variant={groupId === activeGroupId ? 'primary' : 'secondary'}
                      className={cn(
                        'h-8 rounded-full px-3 text-[12px]',
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

            {showExportMenu ? (
              <ExportMenuV2
                scopeLabel="Group rankings + best-third selections (you only)"
                snapshotLabel={formatSnapshotTimestamp(scoringSnapshotTimestamp)}
                lockMessage="Post-lock exports only. CSV format."
                onDownloadCsv={handleDownloadGroupStageCsv}
              />
            ) : null}
          </div>
        </V2Card>

        <div className="grid gap-3 xl:gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="space-y-2.5">
              {groupPicksAlert}
              {groupPicksTable}
            </div>
            {bestThirdPanel}
          </div>

          <RightRailSticky>
            <div className="right-rail flex max-w-full flex-col gap-3 xl:max-w-[420px]">
              {standingsPanel}
              <LeaderboardCardCurated
                rows={leaderboardRowsForCard}
                snapshotLabel={formatSnapshotTimestamp(scoringSnapshotTimestamp)}
                topCount={3}
                title={isFinalResultsMode ? 'Final Leaderboard (Group Stage)' : 'Projected Leaderboard'}
              />
            </div>
          </RightRailSticky>
        </div>
      </div>
    </div>
  )
}
