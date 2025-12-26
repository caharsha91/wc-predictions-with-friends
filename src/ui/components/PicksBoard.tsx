import { useMemo } from 'react'

import {
  groupMatchesByDateAndStage,
  getLockTime,
  isMatchLocked,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
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
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
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
      winner: existing?.winner,
      decidedBy: existing?.decidedBy
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
      {groups.map((group) => {
        const groupKey = `${group.dateKey}__${group.stage}`
        const matchCountLabel = `${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}`

        return (
          <section key={groupKey} className="card matchGroup">
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
              {group.matches.map((match) => {
                const pick = findPick(picks, match.id, CURRENT_USER_ID)
                const locked = isMatchLocked(match.kickoffUtc, now)
                const lockTime = getLockTime(match.kickoffUtc)
                const missing = !isPickComplete(match, pick)
                const outcomeValue = pick?.outcome ?? ''
                const knockoutValue =
                  pick?.winner && pick?.decidedBy ? `${pick.winner}_${pick.decidedBy}` : ''
                const rowClass =
                  missing && highlightMissing ? 'matchRow matchRowMissing' : 'matchRow'
                const statusLabel = getStatusLabel(match.status)
                const statusTone = getStatusTone(match.status)

                return (
                  <div
                    key={match.id}
                    className={rowClass}
                    data-status={statusTone}
                    data-locked={locked ? 'true' : 'false'}
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
                          {locked ? (
                            <span className="statusTag" data-tone="locked">
                              Locked
                            </span>
                          ) : null}
                          {missing ? (
                            <span className="statusTag" data-tone="alert">
                              Missing pick
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="lockNote">
                        {locked
                          ? `Locked since ${formatLockTime(lockTime)}`
                          : `Locks at ${formatLockTime(lockTime)}`}
                      </div>
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
                          Result
                          <select
                            className="pickSelect"
                            value={outcomeValue}
                            onChange={(event) => handleOutcomeChange(match, event.target.value)}
                            disabled={locked}
                          >
                            <option value="">Pick result</option>
                            <option value="WIN">{match.homeTeam.code} Win</option>
                            <option value="DRAW">Draw</option>
                            <option value="LOSS">{match.awayTeam.code} Win</option>
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
                              disabled={locked}
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
        )
      })}
    </div>
  )
}
