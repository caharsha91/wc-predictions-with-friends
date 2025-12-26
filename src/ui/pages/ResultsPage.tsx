import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import DayPagination from '../components/DayPagination'
import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMatches, fetchPicks } from '../../lib/data'
import {
  getDateKeyInTimeZone,
  groupMatchesByDateAndStage,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import { findPick, loadLocalPicks, mergePicks } from '../../lib/picks'
import type { MatchesFile, Match } from '../../types/matches'
import type { Pick } from '../../types/picks'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      data: MatchesFile
      picks: Pick[]
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

export default function ResultsPage() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, picksFile] = await Promise.all([fetchMatches(), fetchPicks()])
        if (canceled) return
        const localPicks = loadLocalPicks(CURRENT_USER_ID)
        const mergedPicks = mergePicks(picksFile.picks, localPicks, CURRENT_USER_ID)
        setState({
          status: 'ready',
          data: matchesFile,
          picks: mergedPicks
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
  }, [])

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
    setActiveDateKey((current) =>
      current && dateKeys.includes(current) ? current : dateKeys[0]
    )
  }, [dateKeys])

  const pagedMatches = useMemo(() => {
    if (!activeDateKey) return []
    return filteredMatches.filter(
      (match) => getDateKeyInTimeZone(match.kickoffUtc) === activeDateKey
    )
  }, [activeDateKey, filteredMatches])

  const groupedMatches = useMemo(() => {
    if (pagedMatches.length === 0) return []
    return groupMatchesByDateAndStage(pagedMatches)
  }, [pagedMatches])

  const showDayPagination = dateKeys.length > 1

  function renderPickSummary(match: Match, pick?: Pick) {
    if (!pick) return <span className="pickMissing">No pick</span>
    const score =
      typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number'
        ? `${pick.homeScore}-${pick.awayScore}`
        : '—'
    const outcome = pick.outcome
      ? pick.outcome === 'WIN'
        ? 'Home win'
        : pick.outcome === 'LOSS'
          ? 'Home loss'
          : 'Draw'
      : '—'
    const knockout =
      match.stage !== 'Group' && pick.winner && pick.decidedBy
        ? `${pick.winner === 'HOME' ? 'Home' : 'Away'} ${pick.decidedBy === 'ET' ? 'AET' : 'Pens'}`
        : match.stage !== 'Group'
          ? '—'
          : null

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

      {state.status === 'loading' ? <div className="muted">Loading...</div> : null}
      {state.status === 'error' ? <div className="error">{state.message}</div> : null}

      {state.status === 'ready' ? (
        <div className="stack">
          <div className="card filtersPanel">
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
                <DayPagination
                  dateKeys={dateKeys}
                  activeDateKey={activeDateKey}
                  onSelect={setActiveDateKey}
                  ariaLabel="Results day"
                />
              </div>
            ) : null}
          </div>
          {groupedMatches.length === 0 ? (
            <div className="card muted">No results yet.</div>
          ) : null}
          {groupedMatches.map((group) => {
            const matchCountLabel = `${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}`
            return (
              <section key={`${group.dateKey}__${group.stage}`} className="card matchGroup">
                <div className="groupHeader">
                  <div className="groupHeaderButton groupHeaderStatic">
                    <span className="groupTitle">
                      <span className="groupDate">{formatDateHeader(group.dateKey)}</span>
                      <span className="groupStage">{group.stage}</span>
                    </span>
                    <span className="toggleMeta">{matchCountLabel}</span>
                  </div>
                </div>

                <div className="list">
                  {group.matches.map((match, index) => {
                    const currentPick = findPick(state.picks, match.id, CURRENT_USER_ID)
                    const showScore =
                      match.status === 'FINISHED' &&
                      typeof match.score?.home === 'number' &&
                      typeof match.score?.away === 'number'
                    const rowStyle = { '--row-index': index } as CSSProperties
                    const statusLabel = getStatusLabel(match.status)
                    const statusTone = getStatusTone(match.status)

                    return (
                      <div
                        key={match.id}
                        className="matchRow"
                        style={rowStyle}
                        data-status={statusTone}
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
                            <div className="matchKickoff">{formatKickoff(match.kickoffUtc)}</div>
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
                        </div>

                        <div className="matchActions">
                          <div
                            className={
                              currentPick ? 'resultsPickRow' : 'resultsPickRow resultsPickMissing'
                            }
                          >
                            <div className="resultsPickName">Your pick</div>
                            {renderPickSummary(match, currentPick)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
