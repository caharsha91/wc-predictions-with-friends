import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { fetchBestThirdQualifiers, fetchBracketPredictions, fetchMatches } from '../../lib/data'
import {
  combineBracketPredictions,
  hasBracketData,
  loadLocalBracketPrediction,
  saveLocalBracketPrediction
} from '../../lib/bracket'
import {
  fetchUserBracketGroupDoc,
  fetchUserBracketKnockoutDoc,
  saveUserBracketGroupDoc,
  saveUserBracketKnockoutDoc
} from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import {
  getDateKeyInTimeZone,
  getLockTimePstForDateKey,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import type { BracketPrediction, GroupPrediction } from '../../types/bracket'
import type { Match, MatchWinner, Team } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { useAuthState } from '../hooks/useAuthState'
import { useNow } from '../hooks/useNow'
import { useViewerId } from '../hooks/useViewerId'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      predictions: BracketPrediction[]
      bestThirdQualifiers: string[]
      lastUpdated: string
    }

const knockoutStageOrder: KnockoutStage[] = ['R32', 'R16', 'QF', 'SF', 'Third', 'Final']
const TBD_TEAM: Team = { code: 'TBD', name: 'TBD' }

type DisplayMatch = Match & {
  displayHomeTeam: Team
  displayAwayTeam: Team
}

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

function resolvePickWinner(match: DisplayMatch, winner?: MatchWinner): Team | undefined {
  if (winner === 'HOME') return match.displayHomeTeam
  if (winner === 'AWAY') return match.displayAwayTeam
  return undefined
}

function resolvePickLoser(match: DisplayMatch, winner?: MatchWinner): Team | undefined {
  if (winner === 'HOME') return match.displayAwayTeam
  if (winner === 'AWAY') return match.displayHomeTeam
  return undefined
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
  const userId = useViewerId()
  const authState = useAuthState()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [prediction, setPrediction] = useState<BracketPrediction | null>(null)
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const firestoreEnabled = hasFirebase && authState.status === 'ready' && !!authState.user

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, bracketFile, bestThirdFile] = await Promise.all([
          fetchMatches(),
          fetchBracketPredictions(),
          fetchBestThirdQualifiers()
        ])
        if (canceled) return
        const predictions = combineBracketPredictions(bracketFile)
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          predictions,
          bestThirdQualifiers: bestThirdFile.qualifiers,
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

  const knockoutDisplayMatches = useMemo(() => {
    if (state.status !== 'ready' || !prediction) return {}

    const stageMap: Partial<Record<KnockoutStage, DisplayMatch[]>> = {}
    let progressionMatches: DisplayMatch[] | null = null
    let semifinalMatches: DisplayMatch[] | null = null

    for (const stage of knockoutStageOrder) {
      const baseMatches = knockoutMatches[stage]
      if (!baseMatches || baseMatches.length === 0) continue

      if (!progressionMatches) {
        const initial = baseMatches.map((match) => ({
          ...match,
          displayHomeTeam: match.homeTeam,
          displayAwayTeam: match.awayTeam
        }))
        stageMap[stage] = initial
        progressionMatches = initial
        if (stage === 'SF') semifinalMatches = initial
        continue
      }

      if (stage === 'Third') {
        const source: DisplayMatch[] = (semifinalMatches ?? progressionMatches) ?? []
        const losers = source.map((match) => {
          const stage = match.stage as KnockoutStage
          return resolvePickLoser(match, prediction.knockout?.[stage]?.[match.id])
        })
        const display = baseMatches.map((match, index) => {
          const home = losers[index * 2] ?? TBD_TEAM
          const away = losers[index * 2 + 1] ?? TBD_TEAM
          return { ...match, displayHomeTeam: home, displayAwayTeam: away }
        })
        stageMap[stage] = display
        continue
      }

      const source: DisplayMatch[] =
        (stage === 'Final' && semifinalMatches ? semifinalMatches : progressionMatches) ?? []
      const winners = source.map((match) => {
        const stage = match.stage as KnockoutStage
        return resolvePickWinner(match, prediction.knockout?.[stage]?.[match.id])
      })
      const display = baseMatches.map((match, index) => {
        const home = winners[index * 2] ?? TBD_TEAM
        const away = winners[index * 2 + 1] ?? TBD_TEAM
        return { ...match, displayHomeTeam: home, displayAwayTeam: away }
      })
      stageMap[stage] = display
      progressionMatches = display
      if (stage === 'SF') semifinalMatches = display
    }

    return stageMap
  }, [knockoutMatches, prediction, state])

  const knockoutMatchDates = useMemo(() => {
    if (state.status !== 'ready') return []
    const dates = new Set<string>()
    for (const match of state.matches) {
      if (match.stage === 'Group') continue
      dates.add(getDateKeyInTimeZone(match.kickoffUtc))
    }
    return [...dates].sort()
  }, [state])

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const bestThirdsReady = useMemo(() => {
    if (state.status !== 'ready') return false
    return state.bestThirdQualifiers.length >= 8
  }, [state])

  const knockoutDrawReady = useMemo(() => {
    if (state.status !== 'ready') return false
    for (const stage of knockoutStageOrder) {
      const stageMatches = state.matches.filter((match) => match.stage === stage)
      if (stageMatches.length === 0) continue
      return stageMatches.every(
        (match) => match.homeTeam.code !== 'TBD' && match.awayTeam.code !== 'TBD'
      )
    }
    return false
  }, [state])

  const knockoutUnlocked = groupStageComplete && bestThirdsReady && knockoutDrawReady

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
    if (knockoutMatchDates.length === 0) return null
    return getLockTimePstForDateKey(knockoutMatchDates[0], -1)
  }, [knockoutMatchDates])

  const now = useNow()
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const knockoutLocked = knockoutLockTime ? now.getTime() >= knockoutLockTime.getTime() : false
  const bracketCardHeight = 76
  const bracketGap = 6
  const knockoutColumns = useMemo(() => {
    const columns: Array<{ key: string; title: string; stages: KnockoutStage[] }> = []
    knockoutStageOrder.forEach((stage) => {
      if (stage === 'Third' || stage === 'Final') return
      if ((knockoutDisplayMatches[stage]?.length ?? 0) === 0) return
      columns.push({ key: stage, title: stage, stages: [stage] })
    })
    const finalStages: KnockoutStage[] = []
    if ((knockoutDisplayMatches.Final?.length ?? 0) > 0) {
      finalStages.push('Final')
    }
    if ((knockoutDisplayMatches.Third?.length ?? 0) > 0) {
      finalStages.push('Third')
    }
    if (finalStages.length > 0) {
      columns.push({ key: 'finals', title: 'Finals', stages: finalStages })
    }
    return columns
  }, [knockoutDisplayMatches])
  const semifinalsIndex = useMemo(
    () => knockoutColumns.findIndex((column) => column.key === 'SF'),
    [knockoutColumns]
  )


  function toggleSection(key: string) {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))
  }

  useEffect(() => {
    if (state.status !== 'ready') return
    if (hasFirebase && authState.status === 'loading') return
    const predictions = state.predictions
    let canceled = false
    async function resolvePrediction(predictionsSource: BracketPrediction[]) {
      const local = loadLocalBracketPrediction(userId)
      const localReady = local ? hasBracketData(local) : false
      const base =
        predictionsSource.find((entry: BracketPrediction) => entry.userId === userId) ?? null
      let initial = ensureGroupEntries(
        (localReady ? local : base) ?? createEmptyPrediction(userId, groupIds),
        groupIds
      )

      if (firestoreEnabled) {
        const [groupDoc, knockoutDoc] = await Promise.all([
          fetchUserBracketGroupDoc(userId),
          fetchUserBracketKnockoutDoc(userId)
        ])
        if (canceled) return
        if (groupDoc || knockoutDoc) {
          initial = {
            ...initial,
            groups: groupDoc?.groups ?? initial.groups,
            bestThirds: groupDoc?.bestThirds ?? initial.bestThirds,
            knockout: knockoutDoc ?? initial.knockout,
            updatedAt: new Date().toISOString()
          }
        } else if (localReady) {
          try {
            await Promise.all([
              saveUserBracketGroupDoc(
                userId,
                initial.groups ?? {},
                initial.bestThirds
              ),
              saveUserBracketKnockoutDoc(userId, initial.knockout)
            ])
          } catch {
            // Ignore Firestore write failures for local-only usage.
          }
        }
        initial = ensureGroupEntries(initial, groupIds)
      }

      setPrediction(initial)
    }
    void resolvePrediction(predictions)
    return () => {
      canceled = true
    }
  }, [authState.status, firestoreEnabled, groupIds, state, userId])

  useEffect(() => {
    if (!prediction) return
    saveLocalBracketPrediction(userId, prediction)
    if (firestoreEnabled) {
      void saveUserBracketGroupDoc(userId, prediction.groups ?? {}, prediction.bestThirds).catch(
        () => {}
      )
      void saveUserBracketKnockoutDoc(userId, prediction.knockout).catch(() => {})
    }
  }, [firestoreEnabled, prediction, userId])

  useEffect(() => {
    if (state.status !== 'ready') return
    if (view === 'knockout' && !knockoutUnlocked) {
      setView('group')
      return
    }
    if (view !== null) return
    setView(knockoutUnlocked ? 'knockout' : 'group')
  }, [knockoutUnlocked, state, view])

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
  const groupSectionCollapsed = collapsedSections.groupQualifiers ?? false
  const bestThirdsCollapsed = collapsedSections.bestThirds ?? false

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
        {knockoutUnlocked ? (
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
        ) : null}
      </div>

      {activeView === 'group' ? (
        <>
          {!knockoutUnlocked ? (
            <div className="card muted">
              Knockout predictions unlock after group stage completion, the best third-place
              qualifiers are published, and the knockout draw is available.
            </div>
          ) : null}
          <section className="card bracketGuide">
            <div className="sectionHeader">
              <div className="sectionTitle">Group stage guide</div>
            </div>
            <div className="bracketGuideContent">
              <p>
                Pick the top two teams from each group in the order they will finish. Then select
                the best third-place qualifiers. Locked picks stay visible after the deadline.
              </p>
              <ul>
                <li>Use the group cards to set 1st and 2nd place.</li>
                <li>Pick 8 third-place teams once group standings settle.</li>
                <li>Saving is automatic; refresh if a lock window has passed.</li>
              </ul>
            </div>
          </section>
          <section className="card">
            <div className="sectionHeader">
              <button
                type="button"
                className="sectionToggle"
                data-collapsed={groupSectionCollapsed ? 'true' : 'false'}
                onClick={() => toggleSection('groupQualifiers')}
                aria-expanded={!groupSectionCollapsed}
              >
                <span className="toggleChevron" aria-hidden="true">
                  ▾
                </span>
                <span className="sectionTitle">Group qualifiers</span>
                <span className="toggleMeta">{groupIds.length} groups</span>
              </button>
              {groupLockTime ? (
                <div className="lockNote">
                  {groupLocked
                    ? `Locked since ${formatLockTime(groupLockTime)}`
                    : `Locks at ${formatLockTime(groupLockTime)}`}
                </div>
              ) : null}
            </div>
            {!groupSectionCollapsed ? (
              groupIds.length === 0 ? (
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
              )
            ) : null}
          </section>

          <section className="card">
            <div className="sectionHeader">
              <button
                type="button"
                className="sectionToggle"
                data-collapsed={bestThirdsCollapsed ? 'true' : 'false'}
                onClick={() => toggleSection('bestThirds')}
                aria-expanded={!bestThirdsCollapsed}
              >
                <span className="toggleChevron" aria-hidden="true">
                  ▾
                </span>
                <span className="sectionTitle">Best third-place qualifiers (pick 8)</span>
                <span className="toggleMeta">8 slots</span>
              </button>
              {groupLockTime ? (
                <div className="lockNote">
                  {groupLocked
                    ? `Locked since ${formatLockTime(groupLockTime)}`
                    : `Locks at ${formatLockTime(groupLockTime)}`}
                </div>
              ) : null}
            </div>
            {!bestThirdsCollapsed ? (
              allGroupTeams.length === 0 ? (
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
              )
            ) : null}
          </section>
        </>
      ) : null}

      {activeView === 'knockout' ? (
        <>
          <section className="card bracketGuide">
            <div className="sectionHeader">
              <div className="sectionTitle">Knockout guide</div>
              {knockoutLockTime ? (
                <div className="lockNote">
                  {knockoutLocked
                    ? `Locked since ${formatLockTime(knockoutLockTime)}`
                    : `Locks at ${formatLockTime(knockoutLockTime)}`}
                </div>
              ) : null}
            </div>
            <div className="bracketGuideContent">
              <p>
                Select the winner for each knockout fixture. Picks are made directly on the team
                pills. Your final pick drives the champion badge once selected.
              </p>
              <ul>
                <li>Rounds progress left to right as the bracket advances.</li>
                <li>Final and third-place games sit together at the end.</li>
                <li>Locked matches remain visible for reference.</li>
              </ul>
            </div>
          </section>
          <section className="card">
            <div className="sectionHeader">
              <div className="sectionTitle">Knockout winners</div>
            </div>
            <div
              className="bracketGraph"
              role="presentation"
              style={{ '--bracket-card-height': `${bracketCardHeight}px` } as CSSProperties}
            >
              {knockoutColumns.map((column, stageIndex) => {
                const stageMatches = column.stages.flatMap((stage) =>
                  (knockoutDisplayMatches[stage] ?? []).map((match) => ({ match, stage }))
                )
                if (stageMatches.length === 0) return null
                const baseStep = bracketCardHeight + bracketGap
                const referenceDepth =
                  column.key === 'finals' && semifinalsIndex >= 0
                    ? semifinalsIndex
                    : stageIndex
                let columnGap = baseStep * Math.pow(2, referenceDepth)
                let columnOffset = ((Math.pow(2, referenceDepth) - 1) * baseStep) / 2
                if (column.key === 'finals' && semifinalsIndex >= 0) {
                  columnOffset += columnGap / 2
                  columnGap = baseStep
                }
                const finalsExtraGap =
                  column.key === 'finals' && stageMatches.length > 1 ? bracketGap * 3 : 0
                const columnHeight =
                  columnOffset +
                  (stageMatches.length - 1) * columnGap +
                  bracketCardHeight +
                  finalsExtraGap
                const hasNext = stageIndex < knockoutColumns.length - 1

                return (
                  <div
                    key={column.key}
                    className="bracketColumn"
                    style={
                      {
                        '--column-gap': `${columnGap}px`,
                        '--column-offset': `${columnOffset}px`,
                      } as CSSProperties
                    }
                  >
                    <div className="bracketColumnHeader">
                      <span className="bracketStageTitle">{column.title}</span>
                      <span className="toggleMeta">
                        {stageMatches.length} match{stageMatches.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div
                      className="bracketColumnMatches"
                      style={{ '--column-height': `${columnHeight}px` } as CSSProperties}
                    >
                      {Array.from({ length: Math.ceil(stageMatches.length / 2) }, (_, pairIndex) =>
                        stageMatches.slice(pairIndex * 2, pairIndex * 2 + 2)
                      ).map((pairMatches, pairIndex) => {
                        const isFinalsColumn = column.key === 'finals' && pairMatches.length === 2
                        const extraGap = isFinalsColumn ? bracketGap * 3 : 0
                        const pairTop = columnOffset + pairIndex * 2 * columnGap
                        const pairHeight =
                          pairMatches.length === 1
                            ? bracketCardHeight
                            : columnGap + bracketCardHeight + extraGap
                        return (
                          <div
                            key={`${column.key}-pair-${pairIndex}`}
                            className="bracketMatchPair"
                            data-has-next={hasNext ? 'true' : 'false'}
                            data-count={String(pairMatches.length)}
                            style={
                              {
                                '--pair-step': `${columnGap}px`,
                                top: `${pairTop}px`,
                                height: `${pairHeight}px`,
                              } as CSSProperties
                            }
                          >
                            {pairMatches.map(({ match, stage }, matchIndex) => {
                              const stagePredictions = prediction.knockout?.[stage] ?? {}
                              const value = stagePredictions[match.id] ?? ''
                              const championTeam =
                                stage === 'Final'
                                  ? value === 'HOME'
                                    ? match.displayHomeTeam
                                    : value === 'AWAY'
                                      ? match.displayAwayTeam
                                      : null
                                  : null
                              return (
                                <div
                                  key={match.id}
                                  className="bracketMatchCard"
                                  data-has-prev={stageIndex > 0 ? 'true' : 'false'}
                                  data-has-next={hasNext ? 'true' : 'false'}
                                  data-is-final={stage === 'Final' ? 'true' : 'false'}
                                  style={
                                    {
                                      top: `${matchIndex * columnGap + (matchIndex === 1 ? extraGap : 0)}px`,
                                    } as CSSProperties
                                  }
                                >
                                  <div className="bracketMatchInfo">
                                    {column.stages.length > 1 ? (
                                      <div className="bracketMatchStageLabel">{stage}</div>
                                    ) : null}
                                    <div className="matchTeams">
                                      <div className="team">
                                        <button
                                          type="button"
                                          className={
                                            value === 'HOME'
                                              ? 'bracketTeamPick active'
                                              : 'bracketTeamPick'
                                          }
                                          disabled={knockoutLocked}
                                          aria-pressed={value === 'HOME'}
                                          onClick={() => handleKnockoutChange(match, 'HOME')}
                                        >
                                          {match.displayHomeTeam.code}
                                        </button>
                                        <span className="teamName">
                                          {match.displayHomeTeam.name}
                                        </span>
                                      </div>
                                      <div className="vs">vs</div>
                                      <div className="team">
                                        <button
                                          type="button"
                                          className={
                                            value === 'AWAY'
                                              ? 'bracketTeamPick active'
                                              : 'bracketTeamPick'
                                          }
                                          disabled={knockoutLocked}
                                          aria-pressed={value === 'AWAY'}
                                          onClick={() => handleKnockoutChange(match, 'AWAY')}
                                        >
                                          {match.displayAwayTeam.code}
                                        </button>
                                        <span className="teamName">
                                          {match.displayAwayTeam.name}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="muted small">
                                      {formatKickoff(match.kickoffUtc)}
                                    </div>
                                  </div>
                                  {stage === 'Final' ? (
                                    <div className="bracketChampionBadge" aria-label="Champion">
                                      <span className="bracketChampionIcon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                          <path
                                            d="M6 4h12v2a4 4 0 0 0 4 4v2a6 6 0 0 1-6 6h-1.5a4.5 4.5 0 0 1-9 0H4a6 6 0 0 1-6-6V10a4 4 0 0 0 4-4V4zm10 2H8a2 2 0 0 1-2 2v2a4 4 0 0 0 4 4h1.5a4.5 4.5 0 0 1 3 0H16a4 4 0 0 0 4-4V8a2 2 0 0 1-2-2zm-6.5 10a2.5 2.5 0 1 0 5 0h-5z"
                                            fill="currentColor"
                                          />
                                        </svg>
                                      </span>
                                      <div className="bracketChampionText">
                                        <span className="bracketChampionLabel">Champion</span>
                                        <span className="bracketChampionTeam">
                                          {championTeam ? championTeam.code : 'TBD'}
                                        </span>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
