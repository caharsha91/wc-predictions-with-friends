import { useEffect, useMemo, useState } from 'react'

import { groupMatchesByDateAndStage } from '../../lib/matches'
import type { MatchesFile } from '../../types/matches'

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MatchesFile }

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

export default function MatchesPage() {
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const url = `${import.meta.env.BASE_URL}data/matches.json`
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Failed to load matches.json (${response.status})`)
        const data = (await response.json()) as MatchesFile
        if (!canceled) setState({ status: 'ready', data })
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

  const groups = useMemo(() => {
    if (state.status !== 'ready') return []
    return groupMatchesByDateAndStage(state.data.matches)
  }, [state])

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <h1 className="h1">Matches</h1>
        {state.status === 'ready' ? (
          <div className="muted small">Last updated: {state.data.lastUpdated}</div>
        ) : null}
      </div>

      {state.status === 'loading' ? <div className="muted">Loading…</div> : null}
      {state.status === 'error' ? <div className="error">{state.message}</div> : null}

      {state.status === 'ready' ? (
        <div className="stack">
          {groups.map((group) => (
            <section key={`${group.dateKey}__${group.stage}`} className="card">
              <div className="row rowSpaceBetween">
                <div>
                  <div className="h2">{group.dateKey}</div>
                  <div className="muted small">{group.stage}</div>
                </div>
              </div>

              <div className="list">
                {group.matches.map((match) => {
                  const showScore =
                    match.status === 'FINISHED' &&
                    typeof match.score?.home === 'number' &&
                    typeof match.score?.away === 'number'

                  return (
                    <div key={match.id} className="matchRow">
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
                            {match.score!.home}–{match.score!.away}
                          </div>
                        ) : null}
                      </div>

                      <div className="matchActions">
                        <button className="button buttonSmall" type="button" disabled>
                          Pick (stub)
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}

