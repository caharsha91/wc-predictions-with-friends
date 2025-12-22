import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchMatches, fetchPicks } from '../../lib/data'
import { getDateKeyInTimeZone } from '../../lib/matches'
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

export default function ResultsPage() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })
  const [view, setView] = useState<'group' | 'knockout' | null>(null)

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
            return (
              <section key={group.key} className="card matchGroup">
                <div className="groupHeader">
                  <div>
                    <div className="groupDate">{formatDateHeader(dateKey)}</div>
                    <div className="groupStage">{stage}</div>
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

                    return (
                      <div key={match.id} className="matchRow" style={rowStyle}>
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

                        <div className="matchMeta">
                          <div className="muted small">{formatKickoff(match.kickoffUtc)}</div>
                          <div className="pill">{match.status}</div>
                          {showScore ? (
                            <div className="score">
                              {match.score!.home}-{match.score!.away}
                            </div>
                          ) : null}
                        </div>

                        <div className="matchActions">
                          <div className={currentPick ? 'resultsPickRow' : 'resultsPickRow resultsPickMissing'}>
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
