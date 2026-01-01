import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import {
  groupMatchesByDateAndStage,
  getLockTime,
  isMatchLocked,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import { findPick, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickOutcome } from '../../types/picks'
import { LockIcon } from './Icons'
import PageHeader from './ui/PageHeader'
import { useNow } from '../hooks/useNow'
import { useViewerId } from '../hooks/useViewerId'

type PicksBoardProps = {
  matches: Match[]
  picks: Pick[]
  onUpdatePicks: (next: Pick[]) => void
  kicker: string
  title: string
  emptyMessage: string
  highlightMissing?: boolean
  jumpToDateKey?: string | null
  jumpToDateKeyNonce?: number
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

function formatPickScore(pick?: Pick) {
  if (!pick) return '—'
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    return `${pick.homeScore}-${pick.awayScore}`
  }
  return '—'
}

function formatOutcomeLabel(match: Match, outcome?: PickOutcome) {
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
  highlightMissing,
  jumpToDateKey,
  jumpToDateKeyNonce
}: PicksBoardProps) {
  const userId = useViewerId()
  const groups = useMemo(() => {
    return groupMatchesByDateAndStage(matches)
  }, [matches])
  const matchdays = useMemo(() => {
    const byDate = new Map<string, { dateKey: string; groups: typeof groups; matches: Match[] }>()
    for (const group of groups) {
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
  }, [groups])
  const matchdayKeys = useMemo(() => matchdays.map((day) => day.dateKey), [matchdays])
  const matchdaySignature = matchdayKeys.join('|')
  const [expandedMatchdays, setExpandedMatchdays] = useState<Set<string>>(() => new Set())
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(() => new Set())

  const missingCount = useMemo(() => {
    return matches.filter((match) => {
      const pick = findPick(picks, match.id, userId)
      return !isPickComplete(match, pick)
    }).length
  }, [matches, picks, userId])

  const now = useNow()

  useEffect(() => {
    if (matchdays.length === 0) {
      setExpandedMatchdays(new Set())
      setExpandedMatches(new Set())
      return
    }
    const initialMatchday = matchdays[0]
    setExpandedMatchdays(new Set([initialMatchday.dateKey]))
    setExpandedMatches(new Set(initialMatchday.matches.map((match) => match.id)))
  }, [matchdaySignature, matchdays])

  useEffect(() => {
    if (!jumpToDateKey) return
    setExpandedMatchdays((current) => {
      if (current.has(jumpToDateKey)) return current
      const next = new Set(current)
      next.add(jumpToDateKey)
      return next
    })
    const jumpMatchday = matchdays.find((day) => day.dateKey === jumpToDateKey)
    if (jumpMatchday) {
      setExpandedMatches((current) => {
        const next = new Set(current)
        jumpMatchday.matches.forEach((match) => next.add(match.id))
        return next
      })
    }
    const target = document.getElementById(`matchday-${jumpToDateKey}`)
    if (target) {
      target.scrollIntoView({ block: 'start' })
    }
  }, [jumpToDateKey, jumpToDateKeyNonce, matchdays])

  function toggleMatchday(dateKey: string) {
    const willExpand = !expandedMatchdays.has(dateKey)
    setExpandedMatchdays((current) => {
      const next = new Set(current)
      if (next.has(dateKey)) {
        next.delete(dateKey)
      } else {
        next.add(dateKey)
      }
      return next
    })
    const matchday = matchdays.find((day) => day.dateKey === dateKey)
    if (!matchday) return
    setExpandedMatches((current) => {
      const next = new Set(current)
      matchday.matches.forEach((match) => {
        if (willExpand) {
          next.add(match.id)
        } else {
          next.delete(match.id)
        }
      })
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

  function handleScoreChange(match: Match, field: 'homeScore' | 'awayScore', value: string) {
    const numeric = value === '' ? undefined : Number(value)
    const input =
      field === 'homeScore'
        ? {
            matchId: match.id,
            userId,
            homeScore: Number.isFinite(numeric) ? numeric : undefined
          }
        : {
            matchId: match.id,
            userId,
            awayScore: Number.isFinite(numeric) ? numeric : undefined
          }
    const next = upsertPick(picks, input)
    onUpdatePicks(next)
  }

  function handleOutcomeChange(match: Match, value: string) {
    const outcome = value === 'WIN' || value === 'DRAW' || value === 'LOSS' ? value : undefined
    const existing = findPick(picks, match.id, userId)
    const next = upsertPick(picks, {
      matchId: match.id,
      userId,
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
        userId,
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
      userId,
      winner,
      decidedBy
    })
    onUpdatePicks(next)
  }

  return (
    <div className="stack">
      <PageHeader
        kicker={kicker}
        title={title}
        subtitle={
          missingCount === 0
            ? 'All picks are in.'
            : `${missingCount} match${missingCount === 1 ? '' : 'es'} missing a pick.`
        }
      />

      {matchdays.length === 0 ? <div className="card muted">{emptyMessage}</div> : null}
      {matchdays.map((matchday) => {
        const matchdayId = `matchday-${matchday.dateKey}`
        const isExpanded = expandedMatchdays.has(matchday.dateKey)
        const matchdayMissing = matchday.matches.filter((match) => {
          const pick = findPick(picks, match.id, userId)
          return !isPickComplete(match, pick)
        }).length
        const matchCountLabel = `${matchday.matches.length} match${
          matchday.matches.length === 1 ? '' : 'es'
        }`
        const missingLabel =
          matchdayMissing === 0
            ? 'All picks in'
            : `${matchdayMissing} missing pick${matchdayMissing === 1 ? '' : 's'}`

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
                  {matchCountLabel} · {missingLabel}
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
                          const pick = findPick(picks, match.id, userId)
                          const locked = isMatchLocked(match.kickoffUtc, now)
                          const lockTime = getLockTime(match.kickoffUtc)
                          const missing = !isPickComplete(match, pick)
                          const outcomeValue = pick?.outcome ?? ''
                          const knockoutValue =
                            pick?.winner && pick?.decidedBy
                              ? `${pick.winner}_${pick.decidedBy}`
                              : ''
                          const rowClass =
                            missing && highlightMissing ? 'matchRow matchRowMissing' : 'matchRow'
                          const statusLabel = getStatusLabel(match.status)
                          const statusTone = getStatusTone(match.status)
                          const isExpandedRow = expandedMatches.has(match.id)
                          const knockoutLabel = formatKnockoutLabel(match, pick)
                          const rowStyle = { '--row-index': index } as CSSProperties

                          return (
                            <div
                              key={match.id}
                              className={rowClass}
                              data-status={statusTone}
                              data-locked={locked ? 'true' : 'false'}
                              data-expanded={isExpandedRow ? 'true' : 'false'}
                              style={rowStyle}
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
                                    {locked ? (
                                      <span
                                        className="statusTag statusTagWithIcon"
                                        data-tone="locked"
                                        title="Edits lock at kickoff."
                                      >
                                        <LockIcon size={14} />
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
                                <div className="matchSummary">
                                  <span className="matchSummaryLabel">Your pick</span>
                                  {pick ? (
                                    <div className="matchSummaryValues">
                                      <span>{formatPickScore(pick)}</span>
                                      <span>{formatOutcomeLabel(match, pick.outcome)}</span>
                                      {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                    </div>
                                  ) : (
                                    <span className="matchSummaryMissing">No pick yet</span>
                                  )}
                                </div>
                                <div className="lockNote">
                                  {locked
                                    ? `Locked since ${formatLockTime(lockTime)}`
                                    : `Locks at ${formatLockTime(lockTime)}`}
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
                                    {isExpandedRow ? 'Hide picks' : 'Edit picks'}
                                  </span>
                                </button>
                                {isExpandedRow ? (
                                  <div className="matchRowDetails">
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
                                            handleScoreChange(
                                              match,
                                              'homeScore',
                                              event.target.value
                                            )
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
                                            handleScoreChange(
                                              match,
                                              'awayScore',
                                              event.target.value
                                            )
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
                                          onChange={(event) =>
                                            handleOutcomeChange(match, event.target.value)
                                          }
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
                                              handleKnockoutExtrasChange(
                                                match,
                                                event.target.value
                                              )
                                            }
                                            disabled={locked}
                                          >
                                            <option value="">Pick knockout winner</option>
                                            <option value="HOME_ET">
                                              {match.homeTeam.code} win AET
                                            </option>
                                            <option value="AWAY_ET">
                                              {match.awayTeam.code} win AET
                                            </option>
                                            <option value="HOME_PENS">
                                              {match.homeTeam.code} win Pens
                                            </option>
                                            <option value="AWAY_PENS">
                                              {match.awayTeam.code} win Pens
                                            </option>
                                          </select>
                                        </label>
                                      ) : null}
                                    </div>
                                    {match.stage !== 'Group' ? (
                                      <div className="pickNote">
                                        Knockout scores are 90 minutes only. Eventual winner
                                        handles extra time and pens.
                                      </div>
                                    ) : null}
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
  )
}
