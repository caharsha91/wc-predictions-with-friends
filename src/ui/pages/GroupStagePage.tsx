import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { fetchBestThirdQualifiers, fetchScoring } from '../../lib/data'
import {
  BEST_THIRD_SLOT_COUNT,
  buildGroupStandingsSnapshot,
  hasExactBestThirdSelection,
  normalizeTeamCodes,
  resolveBestThirdStatus,
  resolveGroupPlacementStatus,
  resolveGroupRowStatus,
  type BestThirdStatus,
  type GroupPlacementStatus
} from '../../lib/groupStageSnapshot'
import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { formatUtcAndLocalDeadline } from '../lib/deadline'
import { cn } from '../lib/utils'
import {
  GROUP_STAGE_GROUP_CODES,
  patchGroupStageSearch,
  readGroupStageQueryState,
  type GroupStageQueryState,
  type GroupStageStatusFilter
} from '../lib/groupStageFilters'

const BEST_THIRD_SLOTS = BEST_THIRD_SLOT_COUNT
const DEFAULT_GROUP_QUALIFIER_POINTS = 3
const EMPTY_MATCHES: Match[] = []

type GroupStageTableRow = {
  groupId: string
  teams: Team[]
  prediction: GroupPrediction
  complete: boolean
  actualTopTwo: string[]
  finishedCount: number
  totalCount: number
  firstResult: GroupPlacementStatus
  secondResult: GroupPlacementStatus
  rowResult: GroupPlacementStatus
}

type InlineRowDraft = {
  groupId: string
  first: string
  second: string
}

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

function groupResultTone(status: GroupPlacementStatus): 'success' | 'danger' | 'secondary' | 'locked' {
  if (status === 'correct') return 'success'
  if (status === 'incorrect') return 'danger'
  if (status === 'locked') return 'locked'
  return 'secondary'
}

function groupResultLabel(status: GroupPlacementStatus): string {
  if (status === 'correct') return 'Correct (Exact)'
  if (status === 'incorrect') return 'Incorrect'
  if (status === 'locked') return 'Locked'
  return 'Pending'
}

function groupResultSurfaceClass(status: GroupPlacementStatus): string {
  if (status === 'correct') return 'bg-[rgba(var(--primary-rgb),0.08)]'
  if (status === 'incorrect') return 'bg-[rgba(var(--danger-rgb),0.08)]'
  if (status === 'locked') return 'bg-[rgba(var(--warning-rgb),0.08)]'
  return 'bg-bg2/40'
}

function bestThirdResultTone(status: BestThirdStatus): 'success' | 'danger' | 'secondary' | 'locked' {
  if (status === 'qualified') return 'success'
  if (status === 'missed') return 'danger'
  if (status === 'locked') return 'locked'
  return 'secondary'
}

function bestThirdResultLabel(status: BestThirdStatus): string {
  if (status === 'qualified') return 'Qualified'
  if (status === 'missed') return 'Missed'
  if (status === 'locked') return 'Locked'
  return 'Pending'
}

function bestThirdResultSurfaceClass(status: BestThirdStatus): string {
  if (status === 'qualified') return 'bg-[rgba(var(--primary-rgb),0.08)]'
  if (status === 'missed') return 'bg-[rgba(var(--danger-rgb),0.08)]'
  if (status === 'locked') return 'bg-[rgba(var(--warning-rgb),0.08)]'
  return 'bg-bg2/40'
}

function formatTeam(code: string | undefined, teams: Team[]): string {
  if (!code) return '—'
  const team = teams.find((entry) => entry.code === code)
  return team ? `${team.code} · ${team.name}` : code
}

function matchesStatusFilter(status: GroupStageStatusFilter, row: GroupStageTableRow): boolean {
  if (status === 'all') return true
  if (status === 'final') return row.complete
  if (status === 'pending') return row.firstResult === 'pending' && row.secondResult === 'pending'
  if (status === 'locked') return row.firstResult === 'locked' && row.secondResult === 'locked'
  if (status === 'correct') return row.firstResult === 'correct' && row.secondResult === 'correct'
  if (status === 'incorrect') return row.firstResult === 'incorrect' && row.secondResult === 'incorrect'
  return true
}

function getDefaultShowStandingsDetails(): boolean {
  if (typeof window === 'undefined') return true
  return !window.matchMedia('(max-width: 768px)').matches
}

export default function GroupStagePage() {
  // QA-SMOKE: route=/play/group-stage and /demo/play/group-stage ; checklist-id=smoke-group-stage-detail
  const navigate = useNavigate()
  const location = useLocation()
  const mode = useRouteDataMode()
  const { showToast } = useToast()
  const now = useNow({ tickMs: 30_000 })
  const isMobile = useMediaQuery('(max-width: 768px)')
  const picksState = usePicksData()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES
  const groupStage = useGroupStageData(matches)
  const bestThirdSectionRef = useRef<HTMLDivElement | null>(null)
  const [qualifiersState, setQualifiersState] = useState<{
    status: 'loading' | 'ready' | 'error'
    qualifiers: string[]
    updatedAt?: string
    message?: string
  }>({ status: 'loading', qualifiers: [] })
  const [groupQualifierPoints, setGroupQualifierPoints] = useState(DEFAULT_GROUP_QUALIFIER_POINTS)
  const [inlineRowDraft, setInlineRowDraft] = useState<InlineRowDraft | null>(null)

  const queryState = useMemo(() => readGroupStageQueryState(location.search), [location.search])

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks') =>
    segment ? `${playRoot}/${segment}` : playRoot

  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const groupIds = groupStage.groupIds
  const bestThirds = normalizeBestThirds(groupStage.data.bestThirds)
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosedByTime = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const groupClosed = groupClosedByTime || groupStage.isLocked

  const completion = useMemo(() => {
    const groupsDone = getCompletionCount(groupStage.data.groups, groupIds)
    const bestThirdDone = normalizeTeamCodes(bestThirds).length
    return { groupsDone, bestThirdDone, bestThirdSelectionValid: hasExactBestThirdSelection(bestThirds) }
  }, [bestThirds, groupIds, groupStage.data.groups])

  const standings = useMemo(() => buildGroupStandingsSnapshot(matches), [matches])
  const qualifiersSet = useMemo(() => new Set(qualifiersState.qualifiers), [qualifiersState.qualifiers])
  const groupsFinal = groupIds.length > 0 && standings.completeGroups.size === groupIds.length
  const bestThirdsFinal = groupsFinal && qualifiersState.qualifiers.length >= BEST_THIRD_SLOTS
  const scoringSnapshotTimestamp = useMemo(() => {
    if (picksState.state.status !== 'ready') return ''
    const timestamps = [picksState.state.lastUpdated, qualifiersState.updatedAt].filter(Boolean) as string[]
    if (timestamps.length === 0) return ''
    return timestamps.reduce((latest, next) => {
      const latestTime = new Date(latest).getTime()
      const nextTime = new Date(next).getTime()
      if (!Number.isFinite(latestTime)) return next
      if (!Number.isFinite(nextTime)) return latest
      return nextTime > latestTime ? next : latest
    })
  }, [picksState.state, qualifiersState.updatedAt])
  const [showStandingsDetails, setShowStandingsDetails] = useState(getDefaultShowStandingsDetails)

  const rows = useMemo<GroupStageTableRow[]>(() => {
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
  }, [groupIds, groupStage.data.groups, groupTeams, groupClosedByTime, standings.completeGroups, standings.finishedMatchesByGroup, standings.standingsByGroup, standings.totalMatchesByGroup])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (queryState.group !== 'all' && row.groupId !== queryState.group) return false
      return matchesStatusFilter(queryState.status, row)
    })
  }, [queryState.group, queryState.status, rows])

  const hasUnsavedInlineRowChanges = useMemo(() => {
    if (!inlineRowDraft) return false
    const persisted = groupStage.data.groups[inlineRowDraft.groupId] ?? {}
    return (persisted.first ?? '') !== inlineRowDraft.first || (persisted.second ?? '') !== inlineRowDraft.second
  }, [groupStage.data.groups, inlineRowDraft])

  const discardInlineRowDraft = useCallback(() => {
    setInlineRowDraft(null)
  }, [])

  const confirmDiscardInlineRowDraft = useCallback(() => {
    if (!hasUnsavedInlineRowChanges) return true
    if (typeof window === 'undefined') return true
    const shouldDiscard = window.confirm('Discard unsaved inline edits for this group?')
    if (!shouldDiscard) return false
    discardInlineRowDraft()
    return true
  }, [discardInlineRowDraft, hasUnsavedInlineRowChanges])

  const updateQueryState = useCallback((patch: Partial<GroupStageQueryState>) => {
    const nextSearch = patchGroupStageSearch(location.search, patch)
    if (nextSearch === location.search) return
    if (!confirmDiscardInlineRowDraft()) return
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch
      },
      { replace: false }
    )
  }, [confirmDiscardInlineRowDraft, location.pathname, location.search, navigate])

  const startInlineRowEdit = useCallback((row: GroupStageTableRow) => {
    if (groupClosed) return
    if (inlineRowDraft?.groupId === row.groupId) return
    if (!confirmDiscardInlineRowDraft()) return
    setInlineRowDraft({
      groupId: row.groupId,
      first: row.prediction.first ?? '',
      second: row.prediction.second ?? ''
    })
  }, [confirmDiscardInlineRowDraft, groupClosed, inlineRowDraft?.groupId])

  const showFirstPlacementColumn = !isMobile || queryState.focus !== '2nd'
  const showSecondPlacementColumn = !isMobile || queryState.focus !== '1st'
  const showPoints = queryState.points === 'on'
  const viewControlValue = queryState.view === 'best3' ? 'best3' : 'groups'

  const bestThirdCandidatesForIndex = useMemo(() => (index: number) => {
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
    return Object.values(groupTeams)
      .flat()
      .filter((team) => !excludedTopTwo.has(team.code) && !selectedElsewhere.has(team.code))
  }, [groupIds, groupStage.data.bestThirds, groupStage.data.groups, groupTeams])

  useEffect(() => {
    let canceled = false

    async function loadPublishedInputs() {
      setQualifiersState({ status: 'loading', qualifiers: [] })
      const [qualifiersResult, scoringResult] = await Promise.allSettled([
        fetchBestThirdQualifiers({ mode }),
        fetchScoring({ mode })
      ])

      if (canceled) return

      if (qualifiersResult.status === 'fulfilled') {
        setQualifiersState({
          status: 'ready',
          qualifiers: normalizeTeamCodes(qualifiersResult.value.qualifiers ?? []),
          updatedAt: qualifiersResult.value.updatedAt
        })
      } else {
        const reason = qualifiersResult.reason
        const message = reason instanceof Error ? reason.message : 'Unknown error'
        setQualifiersState({ status: 'error', qualifiers: [], message, updatedAt: undefined })
      }

      if (scoringResult.status === 'fulfilled') {
        setGroupQualifierPoints(scoringResult.value.bracket.groupQualifiers ?? DEFAULT_GROUP_QUALIFIER_POINTS)
      }
    }

    void loadPublishedInputs()
    return () => {
      canceled = true
    }
  }, [mode])

  useEffect(() => {
    if (queryState.view !== 'best3') return
    const node = bestThirdSectionRef.current
    if (!node) return
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
    node.focus({ preventScroll: true })
  }, [queryState.view, qualifiersState.status])

  useEffect(() => {
    if (!inlineRowDraft) return
    if (groupClosed) {
      discardInlineRowDraft()
      return
    }
    if (!groupStage.data.groups[inlineRowDraft.groupId]) {
      discardInlineRowDraft()
    }
  }, [discardInlineRowDraft, groupClosed, groupStage.data.groups, inlineRowDraft])

  if (picksState.state.status === 'loading' || groupStage.loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
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

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Group stage"
        title="Group Stage Detail"
        subtitle="Compact table view of picks and published outcomes. Scores refresh daily from published snapshots."
        meta={
          <div className="flex items-start gap-3 text-right">
            <ButtonLink to={toPlayPath()} size="sm" variant="primary">
              Back to Play Center
            </ButtonLink>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div data-last-updated="true">
                <div className="uppercase tracking-[0.2em]">Picks last saved</div>
                <div className="text-sm font-semibold text-foreground">
                  {formatTime(groupStage.data.updatedAt)}
                </div>
              </div>
              <div data-last-updated="true">
                <div className="uppercase tracking-[0.2em]">Scoring snapshot</div>
                <div className="text-sm font-semibold text-foreground">
                  {formatTime(scoringSnapshotTimestamp)}
                </div>
              </div>
            </div>
          </div>
        }
      >
        <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={completion.groupsDone === groupIds.length && groupIds.length > 0 ? 'success' : 'warning'}>
                Groups {completion.groupsDone}/{groupIds.length}
              </Badge>
              <Badge tone={completion.bestThirdDone === BEST_THIRD_SLOTS ? 'success' : 'warning'}>
                Best thirds {completion.bestThirdDone}/{BEST_THIRD_SLOTS}
              </Badge>
              <Badge tone={groupClosedByTime ? 'locked' : 'info'}>
                {groupClosedByTime ? 'Closed' : 'Closes'} {formatUtcAndLocalDeadline(groupLockTime?.toISOString())}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-bg2/40 p-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.16em]">Group</span>
                <select
                  value={queryState.group}
                  onChange={(event) => updateQueryState({ group: event.target.value as GroupStageQueryState['group'] })}
                  className="h-8 rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                >
                  <option value="all">All</option>
                  {GROUP_STAGE_GROUP_CODES.map((groupId) => (
                    <option key={`group-filter-${groupId}`} value={groupId}>{`Group ${groupId}`}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.16em]">Focus</span>
                <select
                  value={queryState.focus}
                  onChange={(event) => updateQueryState({ focus: event.target.value as GroupStageQueryState['focus'] })}
                  className="h-8 rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                >
                  <option value="all">Both</option>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.16em]">Status</span>
                <select
                  value={queryState.status}
                  onChange={(event) => updateQueryState({ status: event.target.value as GroupStageQueryState['status'] })}
                  className="h-8 rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="final">Final</option>
                  <option value="correct">Correct (Exact)</option>
                  <option value="incorrect">Incorrect</option>
                  <option value="locked">Locked</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="uppercase tracking-[0.16em]">View</span>
                <select
                  value={viewControlValue}
                  onChange={(event) => updateQueryState({ view: event.target.value as GroupStageQueryState['view'] })}
                  className="h-8 rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                >
                  <option value="groups">Groups</option>
                  <option value="best3">Best 3rd</option>
                </select>
              </label>

              <Button
                size="sm"
                variant={showPoints ? 'primary' : 'secondary'}
                onClick={() => updateQueryState({ points: showPoints ? 'off' : 'on' })}
              >
                Points {showPoints ? 'On' : 'Off'}
              </Button>
            </div>

            {queryState.view === 'impact' ? (
              <div className="text-xs text-muted-foreground">
                `view=impact` is reserved for a later increment. Showing the groups table in this release.
              </div>
            ) : null}

            {groupClosed ? (
              <div className="text-xs text-muted-foreground">
                Group stage is locked for edits. Table remains snapshot-based and read-only until published finals resolve rows.
              </div>
            ) : null}
            {groupStage.saveStatus === 'locked' ? (
              <Alert tone="warning" title="Lock enforced">
                Group-stage edits are blocked after lock. Refresh daily snapshots to review updated outcomes.
              </Alert>
            ) : null}

            <Table className="[&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:tracking-[0.14em]">
              <thead>
                <tr>
                  <th>Group</th>
                  {showFirstPlacementColumn ? (
                    <th className={cn(!isMobile && queryState.focus === '1st' ? 'bg-[rgba(var(--primary-rgb),0.08)]' : undefined)}>
                      1st
                    </th>
                  ) : null}
                  {showSecondPlacementColumn ? (
                    <th className={cn(!isMobile && queryState.focus === '2nd' ? 'bg-[rgba(var(--primary-rgb),0.08)]' : undefined)}>
                      2nd
                    </th>
                  ) : null}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const statusLabel = row.complete ? 'Final' : groupClosedByTime ? 'Locked' : 'Pending'
                  const rowIsEditing = inlineRowDraft?.groupId === row.groupId
                  const rowDraft = rowIsEditing ? inlineRowDraft : null
                  const rowHasUnsavedChanges =
                    rowIsEditing &&
                    rowDraft !== null &&
                    ((row.prediction.first ?? '') !== rowDraft.first || (row.prediction.second ?? '') !== rowDraft.second)
                  const rowIsValid =
                    rowIsEditing &&
                    rowDraft !== null &&
                    Boolean(rowDraft.first) &&
                    Boolean(rowDraft.second) &&
                    rowDraft.first !== rowDraft.second

                  const saveRow = async () => {
                    if (!rowIsEditing || !rowDraft || !rowHasUnsavedChanges || !rowIsValid || groupClosed) return
                    const updatedGroups = {
                      ...groupStage.data.groups,
                      [row.groupId]: {
                        ...(groupStage.data.groups[row.groupId] ?? {}),
                        first: rowDraft.first || undefined,
                        second: rowDraft.second || undefined
                      }
                    }
                    const result = await groupStage.save({
                      ...groupStage.data,
                      groups: updatedGroups,
                      updatedAt: new Date().toISOString()
                    })
                    showToast({
                      tone: result.ok ? 'success' : result.reason === 'locked' ? 'warning' : 'danger',
                      title: result.ok
                        ? `Group ${row.groupId} saved`
                        : result.reason === 'locked'
                          ? 'Group stage locked'
                          : 'Save failed',
                      message: result.ok
                        ? 'Inline group edits were saved.'
                        : result.reason === 'locked'
                          ? 'Post-lock edits are not allowed.'
                          : 'Unable to save inline group edits.'
                    })
                    if (result.ok) {
                      discardInlineRowDraft()
                    }
                  }

                  const renderPlacementCell = (
                    placementLabel: '1st' | '2nd',
                    predictedCode: string | undefined,
                    actualCode: string | undefined,
                    status: GroupPlacementStatus
                  ) => {
                    const emphasisClass =
                      !isMobile && queryState.focus !== 'all'
                        ? queryState.focus === placementLabel
                          ? 'bg-[rgba(var(--primary-rgb),0.06)]'
                          : 'opacity-65'
                        : ''

                    const potentialPoints = predictedCode ? groupQualifierPoints : 0
                    const earnedPoints = status === 'correct' ? groupQualifierPoints : 0

                    return (
                      <td className={cn('align-top', emphasisClass)}>
                        <div className="space-y-1">
                          {rowIsEditing && rowDraft ? (
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span className="uppercase tracking-[0.12em]">{placementLabel} pick</span>
                              <select
                                className="h-9 w-full rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                                value={placementLabel === '1st' ? rowDraft.first : rowDraft.second}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    discardInlineRowDraft()
                                  } else if (event.key === 'Enter') {
                                    event.preventDefault()
                                    void saveRow()
                                  }
                                }}
                                onChange={(event) => {
                                  const value = event.target.value
                                  setInlineRowDraft((current) => {
                                    if (!current || current.groupId !== row.groupId) return current
                                    if (placementLabel === '1st') {
                                      const second = current.second === value ? '' : current.second
                                      return { ...current, first: value, second }
                                    }
                                    const first = current.first === value ? '' : current.first
                                    return { ...current, second: value, first }
                                  })
                                }}
                              >
                                <option value="">Select team</option>
                                {row.teams.map((team) => (
                                  <option key={`${row.groupId}-inline-${placementLabel}-${team.code}`} value={team.code}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <div className="text-sm font-semibold text-foreground">Pick: {formatTeam(predictedCode, row.teams)}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={groupResultTone(status)}>{groupResultLabel(status)}</Badge>
                            {row.complete ? (
                              <span className="text-xs text-muted-foreground">
                                Confirmed final: {formatTeam(actualCode, row.teams)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {groupClosedByTime ? 'Pending final snapshot (locked).' : 'Potential only until final snapshot.'}
                              </span>
                            )}
                          </div>
                          {showPoints ? (
                            <details className="text-[11px] text-muted-foreground">
                              <summary className="cursor-pointer list-none font-medium text-foreground/85">
                                {row.complete ? `Points +${earnedPoints}` : `Potential +${potentialPoints}`}
                              </summary>
                              <div className="pt-1 text-muted-foreground">
                                {row.complete
                                  ? `Why: +${groupQualifierPoints} only when the predicted ${placementLabel} is exact in the published final snapshot.`
                                  : `Why: exact-order points lock in only after a published final snapshot for this group.`}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </td>
                    )
                  }

                  return (
                    <tr key={row.groupId} className={groupResultSurfaceClass(row.rowResult)}>
                      <td>
                        <div className="font-semibold text-foreground">Group {row.groupId}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.finishedCount}/{row.totalCount} matches finished
                        </div>
                      </td>

                      {showFirstPlacementColumn
                        ? renderPlacementCell('1st', row.prediction.first, row.actualTopTwo[0], row.firstResult)
                        : null}

                      {showSecondPlacementColumn
                        ? renderPlacementCell('2nd', row.prediction.second, row.actualTopTwo[1], row.secondResult)
                        : null}

                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={row.complete ? 'success' : groupClosedByTime ? 'locked' : 'secondary'}>{statusLabel}</Badge>
                          {row.complete ? <Badge tone={groupResultTone(row.rowResult)}>{groupResultLabel(row.rowResult)}</Badge> : null}
                        </div>
                      </td>

                      <td>
                        {!groupClosed ? (
                          rowIsEditing ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                loading={groupStage.saveStatus === 'saving'}
                                disabled={!rowHasUnsavedChanges || !rowIsValid || groupClosed}
                                onClick={() => {
                                  void saveRow()
                                }}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={discardInlineRowDraft}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    discardInlineRowDraft()
                                  }
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startInlineRowEdit(row)}
                            >
                              Edit
                            </Button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={showFirstPlacementColumn && showSecondPlacementColumn ? 5 : 4} className="text-center text-xs text-muted-foreground">
                      No groups match the selected filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </Card>
      </PageHeroPanel>

      <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Group standings snapshot</div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowStandingsDetails((current) => !current)}
            >
              {showStandingsDetails ? 'Hide details' : 'Show details'}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Teams are sorted by points, then goal difference, then goals for.
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {groupIds.map((groupId) => {
              const groupStandings = standings.standingsByGroup.get(groupId) ?? []
              return (
                <div key={`standings-${groupId}`} className="rounded-xl border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">Group {groupId}</div>
                    <Badge tone={standings.completeGroups.has(groupId) ? 'success' : 'secondary'}>
                      {standings.completeGroups.has(groupId) ? 'Final' : 'Live'}
                    </Badge>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Pts</th>
                        {showStandingsDetails ? <th>GD</th> : null}
                        {showStandingsDetails ? <th>GA</th> : null}
                        {showStandingsDetails ? <th>GF</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {groupStandings.map((entry) => (
                        <tr key={`group-standing-${groupId}-${entry.code}`}>
                          <td>{entry.code}</td>
                          <td>{entry.points}</td>
                          {showStandingsDetails ? <td>{entry.gd}</td> : null}
                          {showStandingsDetails ? <td>{entry.ga}</td> : null}
                          {showStandingsDetails ? <td>{entry.gf}</td> : null}
                        </tr>
                      ))}
                      {groupStandings.length === 0 ? (
                        <tr>
                          <td colSpan={showStandingsDetails ? 5 : 2} className="text-center text-xs text-muted-foreground">
                            No standings data yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </Table>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div ref={bestThirdSectionRef} tabIndex={-1} className="outline-none">
        <Card
          className={cn(
            'rounded-2xl border-border/60 bg-transparent p-4 sm:p-5',
            queryState.view === 'best3' ? 'ring-1 ring-[var(--border-accent)]' : undefined
          )}
        >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Best 8 third-place qualifiers</div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={bestThirdsFinal ? 'success' : groupClosedByTime ? 'locked' : 'secondary'}>
                {bestThirdsFinal ? 'Final' : groupClosedByTime ? 'Locked' : 'Pending'}
              </Badge>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Select exactly 8 unique teams. Best-3rds correctness is membership-only (`Qualified`/`Missed`) after the
            published final snapshot.
          </div>
          {!completion.bestThirdSelectionValid ? (
            <Alert tone="warning" title="Best thirds incomplete">
              Select exactly {BEST_THIRD_SLOTS} unique teams to complete this section.
            </Alert>
          ) : null}
          {qualifiersState.status === 'ready' ? (
            <div className="text-xs text-muted-foreground">
              Actual qualifiers: {qualifiersState.qualifiers.length > 0 ? qualifiersState.qualifiers.join(', ') : '—'}
            </div>
          ) : null}
          {qualifiersState.status === 'error' ? (
            <Alert tone="warning" title="Unable to load best-third qualifiers">
              {qualifiersState.message}
            </Alert>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bestThirds.map((teamCode, index) => {
              const qualifierResult = resolveBestThirdStatus(
                bestThirdsFinal,
                groupClosedByTime,
                completion.bestThirdSelectionValid,
                teamCode,
                qualifiersSet
              )
              return (
                <div
                  key={`best-third-${index}`}
                  className={`rounded-xl border border-border/70 px-3 py-2 ${bestThirdResultSurfaceClass(qualifierResult)}`}
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Slot {index + 1}</div>
                  {!groupClosed ? (
                    <select
                      className="mt-1 h-9 w-full rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                      value={teamCode ?? ''}
                      onChange={(event) => groupStage.setBestThird(index, event.target.value)}
                    >
                      <option value="">Select team</option>
                      {bestThirdCandidatesForIndex(index).map((team) => (
                        <option key={`inline-best-third-${index}-${team.code}`} value={team.code}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm font-semibold text-foreground">Pick: {teamCode || '—'}</div>
                  )}
                  <div className="mt-1">
                    <Badge tone={bestThirdResultTone(qualifierResult)}>{bestThirdResultLabel(qualifierResult)}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
          {!groupClosed ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                loading={groupStage.saveStatus === 'saving'}
                onClick={async () => {
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
                }}
              >
                Save best-thirds
              </Button>
            </div>
          ) : null}
        </div>
        </Card>
      </div>
    </div>
  )
}
