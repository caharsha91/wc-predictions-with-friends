import { useMemo } from 'react'

import { groupMatchesByDateAndStage, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickOutcome } from '../../types/picks'
import { CURRENT_USER_ID } from '../../lib/constants'

type PicksBoardProps = {
  matches: Match[]
  picks: Pick[]
  onUpdatePicks: (next: Pick[]) => void
  kicker: string
  title: string
  emptyMessage: string
  highlightMissing?: boolean
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

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function PicksBoard({
  matches,
  picks,
  onUpdatePicks,
  kicker,
  title,
  emptyMessage,
  highlightMissing
}: PicksBoardProps) {
  const groups = useMemo(() => {
    return groupMatchesByDateAndStage(matches)
  }, [matches])

  const missingCount = useMemo(() => {
    return matches.filter((match) => {
      const pick = findPick(picks, match.id, CURRENT_USER_ID)
      return !isPickComplete(match, pick)
    }).length
  }, [matches, picks])

  const now = useMemo(() => new Date(), [])

  function handleScoreChange(match: Match, field: 'homeScore' | 'awayScore', value: string) {
    const numeric = value === '' ? undefined : Number(value)
    const input =
      field === 'homeScore'
        ? {
            matchId: match.id,
            userId: CURRENT_USER_ID,
            homeScore: Number.isFinite(numeric) ? numeric : undefined
          }
        : {
            matchId: match.id,
            userId: CURRENT_USER_ID,
            awayScore: Number.isFinite(numeric) ? numeric : undefined
          }
    const next = upsertPick(picks, input)
    onUpdatePicks(next)
  }

  function handleOutcomeChange(match: Match, value: string) {
    const outcome = value === 'WIN' || value === 'DRAW' || value === 'LOSS' ? value : undefined
    const existing = findPick(picks, match.id, CURRENT_USER_ID)
    const next = upsertPick(picks, {
      matchId: match.id,
      userId: CURRENT_USER_ID,
      outcome: outcome as PickOutcome | undefined,
      winner: outcome === 'DRAW' ? existing?.winner : undefined,
      decidedBy: outcome === 'DRAW' ? existing?.decidedBy : undefined
    })
    onUpdatePicks(next)
  }

  function handleKnockoutExtrasChange(match: Match, value: string) {
    if (!value) {
      const next = upsertPick(picks, {
        matchId: match.id,
        userId: CURRENT_USER_ID,
        winner: undefined,
        decidedBy: undefined
      })
      onUpdatePicks(next)
      return
    }
    const [winnerRaw, decidedByRaw] = value.split('_')
    const winner = winnerRaw === 'HOME' || winnerRaw === 'AWAY' ? winnerRaw : undefined
    const decidedBy = decidedByRaw === 'ET' || decidedByRaw === 'PENS' ? decidedByRaw : undefined
    if (!winner || !decidedBy) return
    const next = upsertPick(picks, {
      matchId: match.id,
      userId: CURRENT_USER_ID,
      winner,
      decidedBy
    })
    onUpdatePicks(next)
  }

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <div>
          <div className="sectionKicker">{kicker}</div>
          <h1 className="h1">{title}</h1>
          <div className="muted small">
            {missingCount === 0
              ? 'All picks are in.'
              : `${missingCount} match${missingCount === 1 ? '' : 'es'} missing a pick.`}
          </div>
        </div>
      </div>

      {groups.length === 0 ? <div className="card muted">{emptyMessage}</div> : null}
      {groups.map((group) => (
        <section key={`${group.dateKey}__${group.stage}`} className="card matchGroup">
          <div className="groupHeader">
            <div>
              <div className="groupDate">{formatDateHeader(group.dateKey)}</div>
              <div className="groupStage">{group.stage}</div>
            </div>
          </div>

          <div className="list">
            {group.matches.map((match) => {
              const pick = findPick(picks, match.id, CURRENT_USER_ID)
              const locked = isMatchLocked(match.kickoffUtc, now)
              const lockTime = getLockTime(match.kickoffUtc)
              const missing = !isPickComplete(match, pick)
              const outcomeValue = pick?.outcome ?? ''
              const knockoutValue =
                pick?.winner && pick?.decidedBy ? `${pick.winner}_${pick.decidedBy}` : ''
              const rowClass = missing && highlightMissing ? 'matchRow matchRowMissing' : 'matchRow'

              return (
                <div key={match.id} className={rowClass}>
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
                    {missing ? <div className="pickStatus">Missing pick</div> : null}
                    {locked ? (
                      <div className="lockNote">Locked since {formatLockTime(lockTime)}</div>
                    ) : null}
                  </div>

                  <div className="matchActions">
                    <div className="pickForm">
                      <label className="pickLabel">
                        Exact ({match.homeTeam.code})
                        <input
                          className="pickInput"
                          type="number"
                          min="0"
                          max="20"
                          value={pick?.homeScore ?? ''}
                          onChange={(event) =>
                            handleScoreChange(match, 'homeScore', event.target.value)
                          }
                          disabled={locked}
                        />
                      </label>
                      <label className="pickLabel">
                        Exact ({match.awayTeam.code})
                        <input
                          className="pickInput"
                          type="number"
                          min="0"
                          max="20"
                          value={pick?.awayScore ?? ''}
                          onChange={(event) =>
                            handleScoreChange(match, 'awayScore', event.target.value)
                          }
                          disabled={locked}
                        />
                      </label>
                    </div>
                    <div className="pickForm pickFormStack">
                      <label className="pickLabel">
                        {match.homeTeam.code} result
                        <select
                          className="pickSelect"
                          value={outcomeValue}
                          onChange={(event) => handleOutcomeChange(match, event.target.value)}
                          disabled={locked}
                        >
                          <option value="">Pick outcome</option>
                          <option value="WIN">Home win</option>
                          <option value="DRAW">Draw</option>
                          <option value="LOSS">Home loss</option>
                        </select>
                      </label>
                      {match.stage !== 'Group' ? (
                        <label className="pickLabel">
                          Eventual winner (AET/Pens)
                          <select
                            className="pickSelect"
                            value={knockoutValue}
                            onChange={(event) =>
                              handleKnockoutExtrasChange(match, event.target.value)
                            }
                            disabled={locked || pick?.outcome !== 'DRAW'}
                          >
                            <option value="">Pick knockout winner</option>
                            <option value="HOME_ET">Home wins AET</option>
                            <option value="AWAY_ET">Away wins AET</option>
                            <option value="HOME_PENS">Home wins Pens</option>
                            <option value="AWAY_PENS">Away wins Pens</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
