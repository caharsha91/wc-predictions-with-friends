import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import DayPagination from '../components/DayPagination'
import FiltersPanel from '../components/FiltersPanel'
import { FilterIcon } from '../components/Icons'
import { Alert } from '../components/ui/Alert'
import Skeleton from '../components/ui/Skeleton'
import { fetchMatches, fetchPicks, fetchScoring } from '../../lib/data'
import { fetchUserPicksDoc, saveUserPicksDoc } from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import {
  getDateKeyInTimeZone,
  groupMatchesByDateAndStage,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import {
  findPick,
  flattenPicksFile,
  getPredictedWinner,
  getUserPicksFromFile,
  isPickComplete,
  loadLocalPicks,
  mergePicks,
  saveLocalPicks
} from '../../lib/picks'
import type { MatchesFile, Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { useAuthState } from '../hooks/useAuthState'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useViewerId } from '../hooks/useViewerId'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      data: MatchesFile
      picks: Pick[]
      scoring: ScoringConfig
    }

function formatKickoff(utcIso: string) {
  const date = new Date(utcIso)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateHeader(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function formatLastUpdated(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusLabel(status: Match['status']) {
  if (status === 'IN_PLAY') return 'Live'
  if (status === 'FINISHED') return 'Final'
  return 'Upcoming'
}

function getStatusTone(status: Match['status']) {
  if (status === 'IN_PLAY') return 'live'
  if (status === 'FINISHED') return 'final'
  return 'upcoming'
}

function formatPickScore(pick?: Pick) {
  if (!pick) return '—'
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    return `${pick.homeScore}-${pick.awayScore}`
  }
  return '—'
}

function formatOutcomeLabel(match: Match, outcome?: Pick['outcome']) {
  if (!outcome) return '—'
  if (outcome === 'DRAW') return 'Draw'
  const winnerCode = outcome === 'WIN' ? match.homeTeam.code : match.awayTeam.code
  return `${winnerCode} win`
}

function formatKnockoutLabel(match: Match, pick?: Pick) {
  if (match.stage === 'Group') return null
  if (!pick?.winner || !pick.decidedBy) return null
  const winnerCode = pick.winner === 'HOME' ? match.homeTeam.code : match.awayTeam.code
  const decided = pick.decidedBy === 'ET' ? 'AET' : 'Pens'
  return `${winnerCode} ${decided}`
}

type PickScoreBreakdown = {
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  totalPoints: number
  exactHit: boolean
}

function resolveStageConfig(match: Match, scoring: ScoringConfig) {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function scorePickForMatch(
  match: Match,
  pick: Pick | undefined,
  scoring: ScoringConfig
): PickScoreBreakdown {
  if (!pick || !match.score || match.status !== 'FINISHED') {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, totalPoints: 0, exactHit: false }
  }
  if (!isPickComplete(match, pick)) {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, totalPoints: 0, exactHit: false }
  }
  const config = resolveStageConfig(match, scoring)
  let exactPoints = 0
  let exactHit = false
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    const exact = pick.homeScore === match.score.home && pick.awayScore === match.score.away
    if (exact) {
      exactPoints = config.exactScoreBoth
      exactHit = true
    } else {
      const homeMatch = pick.homeScore === match.score.home
      const awayMatch = pick.awayScore === match.score.away
      if (homeMatch !== awayMatch) {
        exactPoints = config.exactScoreOne
      }
    }
  }

  const actualOutcome =
    match.score.home > match.score.away
      ? 'WIN'
      : match.score.home < match.score.away
        ? 'LOSS'
        : 'DRAW'
  const resultPoints = pick.outcome && pick.outcome === actualOutcome ? config.result : 0

  let knockoutPoints = 0
  if (match.stage !== 'Group' && match.winner && config.knockoutWinner) {
    if (match.decidedBy === 'ET' || match.decidedBy === 'PENS') {
      const predictedWinner = getPredictedWinner(pick)
      if (predictedWinner && predictedWinner === match.winner) {
        knockoutPoints = config.knockoutWinner
      }
    }
  }

  return {
    exactPoints,
    resultPoints,
    knockoutPoints,
    totalPoints: exactPoints + resultPoints + knockoutPoints,
    exactHit
  }
}

export default function ResultsPage() {
  const authState = useAuthState()
  const userId = useViewerId()
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersCollapsed, setFiltersCollapsed] = useState(false)
  const isMobile = useMediaQuery('(max-width: 900px)')
  const filtersExpanded = isMobile ? filtersOpen : !filtersCollapsed
  const filtersId = 'results-filters'
  const firestoreEnabled = hasFirebase && authState.status === 'ready' && !!authState.user

  const toggleFilters = useCallback(() => {
    if (isMobile) {
      setFiltersOpen((current) => !current)
      return
    }
    setFiltersCollapsed((current) => !current)
  }, [isMobile])

  useEffect(() => {
    let canceled = false
    async function load() {
      if (hasFirebase && authState.status === 'loading') return
      setState({ status: 'loading' })
      try {
        const [matchesFile, picksFile, scoring] = await Promise.all([
          fetchMatches(),
          fetchPicks(),
          fetchScoring()
        ])
        if (canceled) return
        const allPicks = flattenPicksFile(picksFile)

        let viewerPicks: Pick[] | null = null
        if (firestoreEnabled) {
          const remote = await fetchUserPicksDoc(userId)
          if (remote !== null) {
            viewerPicks = remote
            saveLocalPicks(userId, remote)
          }
        }

        if (viewerPicks === null) {
          const localPicks = loadLocalPicks(userId)
          if (localPicks.length > 0) {
            viewerPicks = localPicks
          } else {
            viewerPicks = getUserPicksFromFile(picksFile, userId)
          }
          if (firestoreEnabled && viewerPicks.length > 0) {
            try {
              await saveUserPicksDoc(userId, viewerPicks)
            } catch {
              // Ignore Firestore write failures for local-only usage.
            }
          }
        }

        const mergedPicks = mergePicks(allPicks, viewerPicks ?? [], userId)
        setState({
          status: 'ready',
          data: matchesFile,
          picks: mergedPicks,
          scoring
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, userId])

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.data.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const knockoutHasResults = useMemo(() => {
    if (state.status !== 'ready') return false
    return state.data.matches.some(
      (match) => match.stage !== 'Group' && match.status === 'FINISHED'
    )
  }, [state])

  const canShowKnockout = groupStageComplete

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    setView(canShowKnockout && knockoutHasResults ? 'knockout' : 'group')
  }, [canShowKnockout, knockoutHasResults, state, view])

  useEffect(() => {
    if (!canShowKnockout && view === 'knockout') setView('group')
  }, [canShowKnockout, view])

  const activeView = canShowKnockout ? view ?? 'group' : 'group'

  const availableGroups = useMemo(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.data.matches.filter(
      (match) => match.stage === 'Group' && match.status === 'FINISHED'
    )
    const groups = new Set(
      groupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
    return [...groups].sort()
  }, [state])

  useEffect(() => {
    if (activeView !== 'group' && groupFilter !== 'all') {
      setGroupFilter('all')
    }
  }, [activeView, groupFilter])

  useEffect(() => {
    if (groupFilter !== 'all' && !availableGroups.includes(groupFilter)) {
      setGroupFilter('all')
    }
  }, [availableGroups, groupFilter])

  const filteredMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    let matches = state.data.matches.filter((match) => match.status === 'FINISHED')
    matches =
      activeView === 'knockout'
        ? matches.filter((match) => match.stage !== 'Group')
        : matches.filter((match) => match.stage === 'Group')
    if (activeView === 'group' && groupFilter !== 'all') {
      matches = matches.filter((match) => match.group === groupFilter)
    }
    return matches.sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime())
  }, [activeView, groupFilter, state])

  const dateKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const match of filteredMatches) {
      keys.add(getDateKeyInTimeZone(match.kickoffUtc))
    }
    return [...keys].sort((a, b) => b.localeCompare(a))
  }, [filteredMatches])

  useEffect(() => {
    if (dateKeys.length === 0) {
      setActiveDateKey(null)
      return
    }
    setActiveDateKey((current) => (current && dateKeys.includes(current) ? current : dateKeys[0]))
  }, [dateKeys])

  const groupedMatches = useMemo(() => {
    if (filteredMatches.length === 0) return []
    return groupMatchesByDateAndStage(filteredMatches)
  }, [filteredMatches])

  const showDayPagination = dateKeys.length > 1

  const matchdays = useMemo(() => {
    const byDate = new Map<string, { dateKey: string; groups: typeof groupedMatches; matches: Match[] }>()
    for (const group of groupedMatches) {
      const existing = byDate.get(group.dateKey)
      if (existing) {
        existing.groups.push(group)
        existing.matches.push(...group.matches)
        continue
      }
      byDate.set(group.dateKey, {
        dateKey: group.dateKey,
        groups: [group],
        matches: [...group.matches]
      })
    }
    return [...byDate.values()]
  }, [groupedMatches])
  const matchdayKeys = useMemo(() => matchdays.map((day) => day.dateKey), [matchdays])
  const matchdaySignature = matchdayKeys.join('|')
  const [expandedMatchdays, setExpandedMatchdays] = useState<Set<string>>(() => new Set())
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setExpandedMatchdays(new Set())
    setExpandedMatches(new Set())
  }, [matchdaySignature])

  useEffect(() => {
    if (!activeDateKey) return
    setExpandedMatchdays((current) => {
      if (current.has(activeDateKey)) return current
      const next = new Set(current)
      next.add(activeDateKey)
      return next
    })
    const target = document.getElementById(`matchday-${activeDateKey}`)
    if (target) {
      target.scrollIntoView({ block: 'start' })
    }
  }, [activeDateKey])

  function toggleMatchday(dateKey: string) {
    setExpandedMatchdays((current) => {
      const next = new Set(current)
      if (next.has(dateKey)) {
        next.delete(dateKey)
      } else {
        next.add(dateKey)
      }
      return next
    })
  }

  function toggleMatchRow(matchId: string) {
    setExpandedMatches((current) => {
      const next = new Set(current)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        next.add(matchId)
      }
      return next
    })
  }

  function renderPickSummary(match: Match, pick?: Pick) {
    if (!pick) return <span className="pickMissing">No pick</span>
    const score = formatPickScore(pick)
    const outcome = formatOutcomeLabel(match, pick.outcome)
    const knockout = formatKnockoutLabel(match, pick)

    return (
      <div className="resultsPickSummary">
        <span>Exact: {score}</span>
        <span>Outcome: {outcome}</span>
        {knockout ? <span>KO: {knockout}</span> : null}
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <div>
          <div className="sectionKicker">Match Results</div>
          <h1 className="h1">Results</h1>
        </div>
        {state.status === 'ready' ? (
          <div className="lastUpdated">
            <div className="lastUpdatedLabel">Last updated</div>
            <div className="lastUpdatedValue">{formatLastUpdated(state.data.lastUpdated)}</div>
          </div>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <div className="stack">
          <Skeleton height={18} />
          <Skeleton height={18} width="70%" />
          <span className="sr-only">Loading...</span>
        </div>
      ) : null}
      {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}

      {state.status === 'ready' ? (
        <div className="stack">
          <div className="filtersToggleRow">
            <button
              className="actionButton filtersToggleButton"
              type="button"
              data-active={filtersExpanded ? 'true' : 'false'}
              aria-expanded={filtersExpanded}
              aria-controls={filtersId}
              aria-haspopup="dialog"
              onClick={toggleFilters}
            >
              <FilterIcon className="actionIcon" />
              <span>{filtersExpanded ? 'Hide filters' : 'Filters'}</span>
            </button>
          </div>
          <FiltersPanel
            id={filtersId}
            title="Filters"
            subtitle="Refine results"
            isOpen={filtersOpen}
            isCollapsed={filtersCollapsed}
            onClose={() => setFiltersOpen(false)}
          >
            <div className="filtersRow">
              {canShowKnockout ? (
                <div className="bracketToggle" role="tablist" aria-label="Results view">
                  <button
                    className={
                      activeView === 'group' ? 'bracketToggleButton active' : 'bracketToggleButton'
                    }
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'group'}
                    onClick={() => setView('group')}
                  >
                    Group stage
                  </button>
                  <button
                    className={
                      activeView === 'knockout' ? 'bracketToggleButton active' : 'bracketToggleButton'
                    }
                    type="button"
                    role="tab"
                    aria-selected={activeView === 'knockout'}
                    onClick={() => setView('knockout')}
                  >
                    Knockout
                  </button>
                </div>
              ) : (
                <div className="filterCallout">Knockout results unlock after group stage.</div>
              )}
            </div>
            {activeView === 'group' && availableGroups.length > 0 ? (
              <div className="filtersRow">
                <div className="groupFilter">
                  <div className="groupFilterLabel">Group filter</div>
                  <div className="groupFilterChips" role="tablist" aria-label="Group filter">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={groupFilter === 'all'}
                      className={
                        groupFilter === 'all' ? 'groupFilterChip active' : 'groupFilterChip'
                      }
                      onClick={() => setGroupFilter('all')}
                    >
                      All groups
                    </button>
                    {availableGroups.map((group) => (
                      <button
                        key={group}
                        type="button"
                        role="tab"
                        aria-selected={groupFilter === group}
                        className={
                          groupFilter === group ? 'groupFilterChip active' : 'groupFilterChip'
                        }
                        onClick={() => setGroupFilter(group)}
                      >
                        Group {group}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {showDayPagination ? (
              <div className="filtersRow">
                <div className="groupFilter">
                <div className="groupFilterLabel">Jump to matchday</div>
                <DayPagination
                  dateKeys={dateKeys}
                  activeDateKey={activeDateKey}
                  onSelect={setActiveDateKey}
                  ariaLabel="Jump to matchday"
                />
                </div>
              </div>
            ) : null}
          </FiltersPanel>
          {matchdays.length === 0 ? <div className="card muted">No results yet.</div> : null}
          {matchdays.map((matchday) => {
            const matchdayId = `matchday-${matchday.dateKey}`
            const isExpanded = expandedMatchdays.has(matchday.dateKey)
            const matchCountLabel = `${matchday.matches.length} match${
              matchday.matches.length === 1 ? '' : 'es'
            }`
            const matchdayPoints = matchday.matches.reduce((sum, match) => {
              const pick = findPick(state.picks, match.id, userId)
              return sum + scorePickForMatch(match, pick, state.scoring).totalPoints
            }, 0)
            const pointsLabel = `${matchdayPoints} pt${matchdayPoints === 1 ? '' : 's'} earned`

            return (
              <section key={matchday.dateKey} className="card matchdayCard" id={matchdayId}>
                <div className="matchdayHeader">
                  <button
                    type="button"
                    className="sectionToggle matchdayToggle"
                    data-collapsed={isExpanded ? 'false' : 'true'}
                    aria-expanded={isExpanded}
                    aria-controls={`${matchdayId}-panel`}
                    onClick={() => toggleMatchday(matchday.dateKey)}
                  >
                    <span className="toggleChevron" aria-hidden="true">
                      ▾
                    </span>
                    <span className="groupTitle">
                      <span className="groupDate">{formatDateHeader(matchday.dateKey)}</span>
                      <span className="groupStage">Matchday</span>
                    </span>
                    <span className="toggleMeta">
                      {matchCountLabel} · {pointsLabel}
                    </span>
                  </button>
                </div>

                {isExpanded ? (
                  <div className="matchdayPanel" id={`${matchdayId}-panel`}>
                    {matchday.groups.map((group) => {
                      const stageKey = `${matchday.dateKey}-${group.stage}`
                      const stageLabel = `${group.matches.length} match${
                        group.matches.length === 1 ? '' : 'es'
                      }`
                      return (
                        <div key={stageKey} className="matchdayStage">
                          <div className="matchdayStageHeader">
                            <div className="matchdayStageTitle">{group.stage}</div>
                            <div className="matchdayStageMeta">{stageLabel}</div>
                          </div>
                          <div className="list">
                            {group.matches.map((match, index) => {
                              const currentPick = findPick(state.picks, match.id, userId)
                              const showScore =
                                match.status === 'FINISHED' &&
                                typeof match.score?.home === 'number' &&
                                typeof match.score?.away === 'number'
                              const rowStyle = { '--row-index': index } as CSSProperties
                              const statusLabel = getStatusLabel(match.status)
                              const statusTone = getStatusTone(match.status)
                              const isExpandedRow = expandedMatches.has(match.id)
                              const pickScore = scorePickForMatch(
                                match,
                                currentPick,
                                state.scoring
                              )
                              const knockoutLabel = formatKnockoutLabel(match, currentPick)

                              return (
                                <div
                                  key={match.id}
                                  className="matchRow"
                                  style={rowStyle}
                                  data-status={statusTone}
                                  data-expanded={isExpandedRow ? 'true' : 'false'}
                                >
                                  <div className="matchInfo">
                                    <div className="matchTeams">
                                      <div className="team">
                                        <span className="teamCode">{match.homeTeam.code}</span>
                                        <span className="teamName">{match.homeTeam.name}</span>
                                      </div>
                                      <div className="vs">vs</div>
                                      <div className="team">
                                        <span className="teamCode">{match.awayTeam.code}</span>
                                        <span className="teamName">{match.awayTeam.name}</span>
                                      </div>
                                    </div>
                                    <div className="matchSub">
                                      <div className="matchKickoff">
                                        {formatKickoff(match.kickoffUtc)}
                                      </div>
                                      <div className="statusRow">
                                        <span className="statusTag" data-tone={statusTone}>
                                          {statusLabel}
                                        </span>
                                        {showScore ? (
                                          <span className="scoreTag">
                                            {match.score!.home}-{match.score!.away}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="matchSummary">
                                      <span className="matchSummaryLabel">Your pick</span>
                                      {currentPick ? (
                                        <div className="matchSummaryValues">
                                          <span>{formatPickScore(currentPick)}</span>
                                          <span>{formatOutcomeLabel(match, currentPick.outcome)}</span>
                                          {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                        </div>
                                      ) : (
                                        <span className="matchSummaryMissing">No pick</span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="matchActions">
                                    <button
                                      type="button"
                                      className="matchRowToggle"
                                      data-collapsed={isExpandedRow ? 'false' : 'true'}
                                      aria-expanded={isExpandedRow}
                                      onClick={() => toggleMatchRow(match.id)}
                                    >
                                      <span className="toggleChevron" aria-hidden="true">
                                        ▾
                                      </span>
                                      <span className="matchRowToggleLabel">
                                        {isExpandedRow ? 'Hide details' : 'View details'}
                                      </span>
                                    </button>
                                    {isExpandedRow ? (
                                      <div className="matchRowDetails">
                                        <div
                                          className={
                                            currentPick
                                              ? 'resultsPickRow'
                                              : 'resultsPickRow resultsPickMissing'
                                          }
                                        >
                                          <div className="resultsPickName">Your pick</div>
                                          {renderPickSummary(match, currentPick)}
                                        </div>
                                        <div className="pointsBreakdown">
                                          <span className="pointsChip">
                                            Exact {pickScore.exactPoints}
                                          </span>
                                          <span className="pointsChip">
                                            Outcome {pickScore.resultPoints}
                                          </span>
                                          <span className="pointsChip">
                                            KO {pickScore.knockoutPoints}
                                          </span>
                                          <span className="pointsChip pointsChipTotal">
                                            {pickScore.totalPoints} pts
                                          </span>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
