import { useEffect, useMemo, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import { fetchBracketPredictions, fetchMatches } from '../../lib/data'
import {
  hasBracketData,
  loadLocalBracketPrediction,
  saveLocalBracketPrediction
} from '../../lib/bracket'
import {
  getDateKeyInTimeZone,
  getLockTimePstForDateKey,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import type { BracketPrediction, GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; predictions: BracketPrediction[]; lastUpdated: string }

const knockoutStageOrder: KnockoutStage[] = ['R32', 'R16', 'QF', 'SF', 'Third', 'Final']

function formatKickoff(utcIso: string) {
  const date = new Date(utcIso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: PACIFIC_TIME_ZONE,
    timeZoneName: 'short'
  })
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groupMap = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teams = groupMap.get(match.group) ?? new Map<string, Team>()
    teams.set(match.homeTeam.code, match.homeTeam)
    teams.set(match.awayTeam.code, match.awayTeam)
    groupMap.set(match.group, teams)
  }

  const result: Record<string, Team[]> = {}
  for (const [groupId, teams] of groupMap.entries()) {
    result[groupId] = [...teams.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return result
}

function buildKnockoutMatches(matches: Match[]): Partial<Record<KnockoutStage, Match[]>> {
  const stageMap: Partial<Record<KnockoutStage, Match[]>> = {}
  for (const match of matches) {
    if (match.stage === 'Group') continue
    const stage = match.stage as KnockoutStage
    const list = stageMap[stage] ?? []
    list.push(match)
    stageMap[stage] = list
  }
  for (const stage of Object.keys(stageMap) as KnockoutStage[]) {
    stageMap[stage]!.sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    )
  }
  return stageMap
}

function createEmptyPrediction(userId: string, groupIds: string[]): BracketPrediction {
  const groups: Record<string, GroupPrediction> = {}
  for (const groupId of groupIds) {
    groups[groupId] = {}
  }
  const now = new Date().toISOString()
  return {
    id: `bracket-${userId}`,
    userId,
    groups,
    bestThirds: [],
    knockout: {},
    createdAt: now,
    updatedAt: now
  }
}

function ensureGroupEntries(prediction: BracketPrediction, groupIds: string[]): BracketPrediction {
  const nextGroups = { ...prediction.groups }
  let changed = false
  for (const groupId of groupIds) {
    if (!nextGroups[groupId]) {
      nextGroups[groupId] = {}
      changed = true
    }
  }
  if (!changed) return prediction
  return { ...prediction, groups: nextGroups }
}

export default function BracketPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [prediction, setPrediction] = useState<BracketPrediction | null>(null)
  const [view, setView] = useState<'group' | 'knockout' | null>(null)

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, bracketFile] = await Promise.all([
          fetchMatches(),
          fetchBracketPredictions()
        ])
        if (canceled) return
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          predictions: bracketFile.predictions,
          lastUpdated: matchesFile.lastUpdated
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

  const groupTeams = useMemo(() => {
    if (state.status !== 'ready') return {}
    return buildGroupTeams(state.matches)
  }, [state])

  const groupIds = useMemo(() => {
    return Object.keys(groupTeams).sort()
  }, [groupTeams])

  const allGroupTeams = useMemo(() => {
    const teamMap = new Map<string, Team>()
    for (const teams of Object.values(groupTeams)) {
      for (const team of teams) {
        teamMap.set(team.code, team)
      }
    }
    return [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [groupTeams])

  const knockoutMatches = useMemo(() => {
    if (state.status !== 'ready') return {}
    return buildKnockoutMatches(state.matches)
  }, [state])

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const groupMatchDates = useMemo(() => {
    if (state.status !== 'ready') return []
    const dates = new Set<string>()
    for (const match of state.matches) {
      if (match.stage !== 'Group') continue
      dates.add(getDateKeyInTimeZone(match.kickoffUtc))
    }
    return [...dates].sort()
  }, [state])

  const groupLockTime = useMemo(() => {
    if (groupMatchDates.length === 0) return null
    return getLockTimePstForDateKey(groupMatchDates[0], -1)
  }, [groupMatchDates])

  const knockoutLockTime = useMemo(() => {
    if (groupMatchDates.length === 0) return null
    return getLockTimePstForDateKey(groupMatchDates[groupMatchDates.length - 1], 0)
  }, [groupMatchDates])

  const now = useMemo(() => new Date(), [])
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const knockoutLocked = knockoutLockTime ? now.getTime() >= knockoutLockTime.getTime() : false

  useEffect(() => {
    if (state.status !== 'ready') return
    const local = loadLocalBracketPrediction(CURRENT_USER_ID)
    const localReady = local ? hasBracketData(local) : false
    const base = state.predictions.find((entry) => entry.userId === CURRENT_USER_ID)
    const initial = ensureGroupEntries(
      (localReady ? local : base) ?? createEmptyPrediction(CURRENT_USER_ID, groupIds),
      groupIds
    )
    setPrediction(initial)
  }, [state, groupIds])

  useEffect(() => {
    if (!prediction) return
    saveLocalBracketPrediction(CURRENT_USER_ID, prediction)
  }, [prediction])

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    setView(groupStageComplete ? 'knockout' : 'group')
  }, [groupStageComplete, state, view])

  function handleGroupChange(groupId: string, field: 'first' | 'second', value: string) {
    setPrediction((current) => {
      if (!current) return current
      const group = { ...current.groups[groupId] }
      const nextValue = value || undefined
      if (field === 'first') {
        group.first = nextValue
        if (group.second === nextValue) group.second = undefined
      } else {
        group.second = nextValue
        if (group.first === nextValue) group.first = undefined
      }
      return {
        ...current,
        groups: { ...current.groups, [groupId]: group },
        updatedAt: new Date().toISOString()
      }
    })
  }

  function handleKnockoutChange(match: Match, value: string) {
    setPrediction((current) => {
      if (!current) return current
      const stage = match.stage as KnockoutStage
      const winner = value === 'HOME' || value === 'AWAY' ? value : undefined
      const stagePredictions = { ...(current.knockout?.[stage] ?? {}) }
      if (winner) {
        stagePredictions[match.id] = winner
      } else {
        delete stagePredictions[match.id]
      }
      const knockout = { ...(current.knockout ?? {}) }
      if (Object.keys(stagePredictions).length === 0) {
        delete knockout[stage]
      } else {
        knockout[stage] = stagePredictions
      }
      return {
        ...current,
        knockout,
        updatedAt: new Date().toISOString()
      }
    })
  }

  function handleBestThirdChange(index: number, value: string) {
    setPrediction((current) => {
      if (!current) return current
      const nextValue = value || ''
      const nextBestThirds = [...(current.bestThirds ?? [])]
      while (nextBestThirds.length < 8) {
        nextBestThirds.push('')
      }
      if (nextValue) {
        for (let i = 0; i < nextBestThirds.length; i += 1) {
          if (i !== index && nextBestThirds[i] === nextValue) {
            nextBestThirds[i] = ''
          }
        }
      }
      nextBestThirds[index] = nextValue
      return {
        ...current,
        bestThirds: nextBestThirds,
        updatedAt: new Date().toISOString()
      }
    })
  }

  const missingGroups = useMemo(() => {
    if (!prediction) return 0
    return groupIds.filter((groupId) => {
      const group = prediction.groups[groupId]
      return !group?.first || !group?.second
    }).length
  }, [groupIds, prediction])

  const missingThirds = useMemo(() => {
    if (!prediction) return 8
    const filled = (prediction.bestThirds ?? []).filter((code) => Boolean(code)).length
    return Math.max(0, 8 - filled)
  }, [prediction])

  const missingKnockout = useMemo(() => {
    if (!prediction) return 0
    let missing = 0
    for (const stage of knockoutStageOrder) {
      const matches = knockoutMatches[stage]
      if (!matches) continue
      const stagePredictions = prediction.knockout?.[stage]
      for (const match of matches) {
        if (!stagePredictions?.[match.id]) missing += 1
      }
    }
    return missing
  }, [knockoutMatches, prediction])

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>
  if (!prediction) return null
  const activeView = view ?? 'group'

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <div>
          <div className="sectionKicker">Bracket Challenge</div>
          <h1 className="h1">Bracket Predictions</h1>
          <div className="muted small">
            {missingGroups === 0 && missingThirds === 0 && missingKnockout === 0
              ? 'All bracket picks are in.'
              : `${missingGroups} group${missingGroups === 1 ? '' : 's'}, ${missingThirds} third-place pick${
                  missingThirds === 1 ? '' : 's'
                }, and ${missingKnockout} knockout pick${missingKnockout === 1 ? '' : 's'} missing.`}
          </div>
        </div>
        <div className="lastUpdated">
          <div className="lastUpdatedLabel">Match data</div>
          <div className="lastUpdatedValue">{formatKickoff(state.lastUpdated)}</div>
        </div>
      </div>

      <div className="bracketToggle" role="tablist" aria-label="Bracket prediction view">
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

      {activeView === 'group' ? (
        <>
          <section className="card">
            <div className="row rowSpaceBetween">
              <div className="sectionTitle">Group qualifiers</div>
              {groupLockTime ? (
                <div className="lockNote">
                  {groupLocked
                    ? `Locked since ${formatLockTime(groupLockTime)}`
                    : `Locks at ${formatLockTime(groupLockTime)}`}
                </div>
              ) : null}
            </div>
            {groupIds.length === 0 ? (
              <div className="muted">
                Group data is not available yet. Run the daily sync once group assignments are known.
              </div>
            ) : (
              <div className="bracketGroupGrid">
                {groupIds.map((groupId) => {
                  const teams = groupTeams[groupId] ?? []
                  const group = prediction.groups[groupId] ?? {}
                  const firstValue = group.first ?? ''
                  const secondValue = group.second ?? ''
                  const secondOptions = teams.filter((team) => team.code !== firstValue)

                  return (
                    <div key={groupId} className="bracketGroupCard">
                      <div className="bracketGroupHeader">Group {groupId}</div>
                      <label className="pickLabel">
                        1st place
                        <select
                          className="pickSelect"
                          value={firstValue}
                          disabled={groupLocked}
                          onChange={(event) =>
                            handleGroupChange(groupId, 'first', event.target.value)
                          }
                        >
                          <option value="">Select team</option>
                          {teams.map((team) => (
                            <option key={team.code} value={team.code}>
                              {team.code} - {team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="pickLabel">
                        2nd place
                        <select
                          className="pickSelect"
                          value={secondValue}
                          disabled={groupLocked}
                          onChange={(event) =>
                            handleGroupChange(groupId, 'second', event.target.value)
                          }
                        >
                          <option value="">Select team</option>
                          {secondOptions.map((team) => (
                            <option key={team.code} value={team.code}>
                              {team.code} - {team.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="row rowSpaceBetween">
              <div className="sectionTitle">Best third-place qualifiers (pick 8)</div>
              {groupLockTime ? (
                <div className="lockNote">
                  {groupLocked
                    ? `Locked since ${formatLockTime(groupLockTime)}`
                    : `Locks at ${formatLockTime(groupLockTime)}`}
                </div>
              ) : null}
            </div>
            {allGroupTeams.length === 0 ? (
              <div className="muted">
                Group data is not available yet. Run the daily sync once group assignments are known.
              </div>
            ) : (
              <div className="bracketThirdGrid">
                {Array.from({ length: 8 }).map((_, index) => {
                  const selected = prediction.bestThirds?.[index] ?? ''
                  const taken = new Set(
                    (prediction.bestThirds ?? []).filter((code) => code && code !== selected)
                  )
                  const options = allGroupTeams.filter((team) => !taken.has(team.code))
                  return (
                    <label key={`third-${index}`} className="pickLabel">
                      Slot {index + 1}
                      <select
                        className="pickSelect"
                        value={selected}
                        disabled={groupLocked}
                        onChange={(event) => handleBestThirdChange(index, event.target.value)}
                      >
                        <option value="">Select team</option>
                        {options.map((team) => (
                          <option key={team.code} value={team.code}>
                            {team.code} - {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })}
              </div>
            )}
          </section>
        </>
      ) : null}

      {activeView === 'knockout' ? (
        <section className="card">
          <div className="row rowSpaceBetween">
            <div className="sectionTitle">Knockout winners</div>
            {knockoutLockTime ? (
              <div className="lockNote">
                {knockoutLocked
                  ? `Locked since ${formatLockTime(knockoutLockTime)}`
                  : `Locks at ${formatLockTime(knockoutLockTime)}`}
              </div>
            ) : null}
          </div>
          {knockoutStageOrder.map((stage) => {
            const matches = knockoutMatches[stage]
            if (!matches || matches.length === 0) return null
            const stagePredictions = prediction.knockout?.[stage] ?? {}

            return (
              <div key={stage} className="bracketStageBlock">
                <div className="bracketStageTitle">{stage}</div>
                <div className="bracketStageList">
                  {matches.map((match) => {
                    const value = stagePredictions[match.id] ?? ''
                    return (
                      <div key={match.id} className="bracketMatchRow">
                        <div className="bracketMatchInfo">
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
                          <div className="muted small">{formatKickoff(match.kickoffUtc)}</div>
                        </div>
                        <label className="pickLabel">
                          Winner
                          <select
                            className="pickSelect"
                            value={value}
                            disabled={knockoutLocked}
                            onChange={(event) => handleKnockoutChange(match, event.target.value)}
                          >
                            <option value="">Select winner</option>
                            <option value="HOME">Home ({match.homeTeam.code})</option>
                            <option value="AWAY">Away ({match.awayTeam.code})</option>
                          </select>
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
