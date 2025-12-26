import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMatches, fetchMembers, fetchPicks } from '../../lib/data'
import { downloadCsv, formatExportFilename, getLatestMatch } from '../../lib/exports'
import { getDateKeyInTimeZone } from '../../lib/matches'
import { findPick, getOutcomeFromScores, loadLocalPicks, mergePicks } from '../../lib/picks'
import type { Member } from '../../types/members'
import type { MatchesFile, Match } from '../../types/matches'
import type { Pick } from '../../types/picks'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      data: MatchesFile
      picks: Pick[]
      members: Member[]
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
  const date = new Date(`${dateKey}T00:00:00`)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
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
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [exportMatchScope, setExportMatchScope] = useState<'finished' | 'latest'>('finished')

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, membersFile, picksFile] = await Promise.all([
          fetchMatches(),
          fetchMembers(),
          fetchPicks()
        ])
        if (canceled) return
        const localPicks = loadLocalPicks(CURRENT_USER_ID)
        const mergedPicks = mergePicks(picksFile.picks, localPicks, CURRENT_USER_ID)
        setState({
          status: 'ready',
          data: matchesFile,
          picks: mergedPicks,
          members: membersFile.members
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

  const orderedMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.data.matches
      .filter((match) => match.status === 'FINISHED')
      .filter((match) =>
        view === 'knockout' ? match.stage !== 'Group' : match.stage === 'Group'
      )
      .sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime())
  }, [state, view])

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

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    setView(groupStageComplete && knockoutHasResults ? 'knockout' : 'group')
  }, [groupStageComplete, knockoutHasResults, state, view])

  const groupedMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    const groups: { key: string; matches: Match[] }[] = []
    const map = new Map<string, Match[]>()
    for (const match of orderedMatches) {
      const dateKey = getDateKeyInTimeZone(match.kickoffUtc)
      const groupKey = `${dateKey}__${match.stage}`
      const existing = map.get(groupKey)
      if (existing) {
        existing.push(match)
      } else {
        map.set(groupKey, [match])
        groups.push({ key: groupKey, matches: map.get(groupKey)! })
      }
    }
    return groups
  }, [orderedMatches, state])

  const finishedMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.data.matches.filter((match) => match.status === 'FINISHED')
  }, [state])

  const latestFinishedMatch = useMemo(
    () => getLatestMatch(finishedMatches),
    [finishedMatches]
  )

  const exportMatchIds = useMemo(() => {
    if (state.status !== 'ready') return new Set<string>()
    if (exportMatchScope === 'latest') {
      return latestFinishedMatch ? new Set([latestFinishedMatch.id]) : new Set()
    }
    return new Set(finishedMatches.map((match) => match.id))
  }, [exportMatchScope, finishedMatches, latestFinishedMatch, state])

  const matchById = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, Match>()
    return new Map(state.data.matches.map((match) => [match.id, match]))
  }, [state])

  const memberById = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, Member>()
    return new Map(state.members.map((member) => [member.id, member]))
  }, [state])

  const hasPickExport =
    state.status === 'ready' && state.members.length > 0 && exportMatchIds.size > 0
  const latestPickMatchLabel = latestFinishedMatch
    ? `${latestFinishedMatch.homeTeam.code} vs ${latestFinishedMatch.awayTeam.code}`
    : 'No finished matches yet'

  function toggleGroup(key: string) {
    setCollapsedGroups((current) => ({ ...current, [key]: !current[key] }))
  }

  function handleExportPicks() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || exportMatchIds.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'match_id',
      'stage',
      'group',
      'kickoff_utc',
      'home_team',
      'away_team',
      'pick_home_score',
      'pick_away_score',
      'pick_outcome',
      'pick_winner',
      'pick_decided_by',
      'result_home_score',
      'result_away_score',
      'result_winner',
      'result_decided_by'
    ]
    const rows = state.picks
      .filter((pick) => exportMatchIds.has(pick.matchId))
      .map((pick) => {
        const match = matchById.get(pick.matchId)
        const member = memberById.get(pick.userId)
        if (!match) {
          return {
            user_id: pick.userId,
            user_name: member?.name ?? pick.userId,
            match_id: pick.matchId,
            stage: '',
            group: '',
            kickoff_utc: '',
            home_team: '',
            away_team: '',
            pick_home_score: pick.homeScore ?? '',
            pick_away_score: pick.awayScore ?? '',
            pick_outcome: pick.outcome ?? getOutcomeFromScores(pick.homeScore, pick.awayScore) ?? '',
            pick_winner: '',
            pick_decided_by: pick.decidedBy ?? '',
            result_home_score: '',
            result_away_score: '',
            result_winner: '',
            result_decided_by: ''
          }
        }
        const pickOutcome = pick.outcome ?? getOutcomeFromScores(pick.homeScore, pick.awayScore)
        const pickWinner =
          pick.winner === 'HOME'
            ? match.homeTeam.code
            : pick.winner === 'AWAY'
              ? match.awayTeam.code
              : ''
        const resultWinner =
          match.winner === 'HOME'
            ? match.homeTeam.code
            : match.winner === 'AWAY'
              ? match.awayTeam.code
              : ''
        return {
          user_id: pick.userId,
          user_name: member?.name ?? pick.userId,
          match_id: match.id,
          stage: match.stage,
          group: match.group ?? '',
          kickoff_utc: match.kickoffUtc,
          home_team: match.homeTeam.code,
          away_team: match.awayTeam.code,
          pick_home_score: pick.homeScore ?? '',
          pick_away_score: pick.awayScore ?? '',
          pick_outcome: pickOutcome ?? '',
          pick_winner: pickWinner,
          pick_decided_by: pick.decidedBy ?? '',
          result_home_score: match.score?.home ?? '',
          result_away_score: match.score?.away ?? '',
          result_winner: resultWinner,
          result_decided_by: match.decidedBy ?? ''
        }
      })

    downloadCsv(formatExportFilename('picks', exportMatchScope), headers, rows)
  }

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

  const activeView = view ?? 'group'

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
          <div className="card exportPanel">
            <div className="exportHeader">
              <div>
                <div className="sectionKicker">Exports</div>
                <div className="sectionTitle">Match picks</div>
              </div>
              <div className="exportMeta">
                <span className="exportNote">Finished games only</span>
                <span className="exportBadge">All users</span>
              </div>
            </div>
            <div className="exportControls">
              <div className="exportField">
                <span className="exportFieldLabel">Match window</span>
                <div className="exportToggle" role="group" aria-label="Match window">
                  <button
                    type="button"
                    className={
                      exportMatchScope === 'finished'
                        ? 'exportToggleButton exportToggleButtonActive'
                        : 'exportToggleButton'
                    }
                    onClick={() => setExportMatchScope('finished')}
                    aria-pressed={exportMatchScope === 'finished'}
                  >
                    Finished matches
                  </button>
                  <button
                    type="button"
                    className={
                      exportMatchScope === 'latest'
                        ? 'exportToggleButton exportToggleButtonActive'
                        : 'exportToggleButton'
                    }
                    onClick={() => setExportMatchScope('latest')}
                    aria-pressed={exportMatchScope === 'latest'}
                  >
                    Latest match only
                  </button>
                </div>
              </div>
              <div className="exportHint">
                {exportMatchScope === 'latest'
                  ? 'Exports include the latest finished match.'
                  : 'Exports include all finished matches.'}
              </div>
            </div>
            <div className="exportList">
              <div className="exportRow">
                <div className="exportRowText">
                  <div className="exportRowTitle">All picks</div>
                  <div className="exportRowHint">
                    {exportMatchScope === 'latest' ? latestPickMatchLabel : 'All finished matches.'}
                  </div>
                </div>
                <button
                  type="button"
                  className="button buttonSmall"
                  onClick={handleExportPicks}
                  disabled={!hasPickExport}
                >
                  CSV
                </button>
              </div>
            </div>
          </div>
          <div className="bracketToggle" role="tablist" aria-label="Results view">
            <button
              className={activeView === 'group' ? 'bracketToggleButton active' : 'bracketToggleButton'}
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
          {groupedMatches.length === 0 ? (
            <div className="card muted">No results yet.</div>
          ) : null}
          {groupedMatches.map((group) => {
            const [dateKey, stage] = group.key.split('__')
            const isCollapsed = collapsedGroups[group.key] ?? false
            const matchCountLabel = `${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}`
            return (
              <section key={group.key} className="card matchGroup">
                <div className="groupHeader">
                  <button
                    type="button"
                    className="groupHeaderButton"
                    data-collapsed={isCollapsed ? 'true' : 'false'}
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="toggleChevron" aria-hidden="true">
                      ▾
                    </span>
                    <span className="groupTitle">
                      <span className="groupDate">{formatDateHeader(dateKey)}</span>
                      <span className="groupStage">{stage}</span>
                    </span>
                    <span className="toggleMeta">{matchCountLabel}</span>
                  </button>
                </div>

                {!isCollapsed ? (
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
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
