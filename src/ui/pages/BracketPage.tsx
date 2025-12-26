import { useEffect, useMemo, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import {
  fetchBestThirdQualifiers,
  fetchBracketPredictions,
  fetchMatches,
  fetchMembers
} from '../../lib/data'
import {
  buildGroupStandingsSnapshot,
  downloadCsv,
  formatExportFilename,
  getLatestMatch,
  resolveBestThirdQualifiers
} from '../../lib/exports'
import type { CsvValue } from '../../lib/exports'
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
import type { Member } from '../../types/members'
import type { Match, MatchWinner, Team } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      predictions: BracketPrediction[]
      bestThirdQualifiers: string[]
      members: Member[]
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
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [prediction, setPrediction] = useState<BracketPrediction | null>(null)
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [exportMatchScope, setExportMatchScope] = useState<'finished' | 'latest'>('finished')

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, membersFile, bracketFile, bestThirdFile] = await Promise.all([
          fetchMatches(),
          fetchMembers(),
          fetchBracketPredictions(),
          fetchBestThirdQualifiers()
        ])
        if (canceled) return
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          predictions: bracketFile.predictions,
          bestThirdQualifiers: bestThirdFile.qualifiers,
          members: membersFile.members,
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

  const groupStandings = useMemo(() => {
    if (state.status !== 'ready') return new Map()
    return buildGroupStandingsSnapshot(state.matches)
  }, [state])

  const groupComplete = useMemo(() => {
    if (groupStandings.size === 0) return false
    return [...groupStandings.values()].every((summary) => summary.complete)
  }, [groupStandings])

  const finishedGroupMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches.filter((match) => match.stage === 'Group' && match.status === 'FINISHED')
  }, [state])

  const finishedKnockoutMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches.filter((match) => match.stage !== 'Group' && match.status === 'FINISHED')
  }, [state])

  const latestGroupMatch = useMemo(
    () => getLatestMatch(finishedGroupMatches),
    [finishedGroupMatches]
  )

  const latestKnockoutMatch = useMemo(
    () => getLatestMatch(finishedKnockoutMatches),
    [finishedKnockoutMatches]
  )

  const groupIdsForExport = useMemo(() => {
    if (state.status !== 'ready') return new Set<string>()
    if (exportMatchScope === 'latest') {
      return latestGroupMatch?.group ? new Set([latestGroupMatch.group]) : new Set()
    }
    return new Set(
      finishedGroupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
  }, [exportMatchScope, finishedGroupMatches, latestGroupMatch, state])

  const knockoutMatchIds = useMemo(() => {
    if (state.status !== 'ready') return new Set<string>()
    if (exportMatchScope === 'latest') {
      return latestKnockoutMatch ? new Set([latestKnockoutMatch.id]) : new Set()
    }
    return new Set(finishedKnockoutMatches.map((match) => match.id))
  }, [exportMatchScope, finishedKnockoutMatches, latestKnockoutMatch, state])

  const matchById = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, Match>()
    return new Map(state.matches.map((match) => [match.id, match]))
  }, [state])

  const hasGroupExport =
    state.status === 'ready' && state.members.length > 0 && groupIdsForExport.size > 0
  const hasKnockoutExport =
    state.status === 'ready' && state.members.length > 0 && knockoutMatchIds.size > 0
  const latestGroupMatchLabel = latestGroupMatch
    ? `${latestGroupMatch.homeTeam.code} vs ${latestGroupMatch.awayTeam.code}`
    : 'No finished group match yet'
  const latestKnockoutMatchLabel = latestKnockoutMatch
    ? `${latestKnockoutMatch.homeTeam.code} vs ${latestKnockoutMatch.awayTeam.code}`
    : 'No finished knockout match yet'

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

  const now = useMemo(() => new Date(), [])
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const knockoutLocked = knockoutLockTime ? now.getTime() >= knockoutLockTime.getTime() : false

  const exportPredictions = useMemo(() => {
    if (state.status !== 'ready') return []
    if (!prediction) return state.predictions
    const remaining = state.predictions.filter((item) => item.userId !== prediction.userId)
    return [...remaining, prediction]
  }, [prediction, state])

  function toggleSection(key: string) {
    setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))
  }

  function handleExportGroup() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || groupIdsForExport.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'category',
      'group_id',
      'slot',
      'pick',
      'actual',
      'group_complete'
    ]
    const rows: Array<Record<string, CsvValue>> = []
    const actualBestThirds = groupComplete
      ? resolveBestThirdQualifiers(groupStandings, state.bestThirdQualifiers)
      : undefined
    const predictionsByUser = new Map(exportPredictions.map((item) => [item.userId, item]))

    for (const member of state.members) {
      const predictionForMember = predictionsByUser.get(member.id)
      if (!predictionForMember) continue
      for (const [groupId, groupPick] of Object.entries(predictionForMember.groups)) {
        if (!groupIdsForExport.has(groupId)) continue
        const summary = groupStandings.get(groupId)
        const actualFirst = summary?.complete ? summary.standings[0]?.team.code ?? '' : ''
        const actualSecond = summary?.complete ? summary.standings[1]?.team.code ?? '' : ''
        rows.push({
          user_id: member.id,
          user_name: member.name,
          category: 'group',
          group_id: groupId,
          slot: 'first',
          pick: groupPick.first ?? '',
          actual: actualFirst,
          group_complete: summary?.complete ?? false
        })
        rows.push({
          user_id: member.id,
          user_name: member.name,
          category: 'group',
          group_id: groupId,
          slot: 'second',
          pick: groupPick.second ?? '',
          actual: actualSecond,
          group_complete: summary?.complete ?? false
        })
      }

      if (groupComplete && actualBestThirds && actualBestThirds.length > 0) {
        const predictedThirds = predictionForMember.bestThirds ?? []
        predictedThirds.forEach((team, index) => {
          rows.push({
            user_id: member.id,
            user_name: member.name,
            category: 'best_third',
            group_id: '',
            slot: `${index + 1}`,
            pick: team ?? '',
            actual: actualBestThirds[index] ?? '',
            group_complete: true
          })
        })
      }
    }

    downloadCsv(formatExportFilename('bracket-group', exportMatchScope), headers, rows)
  }

  function handleExportKnockout() {
    if (state.status !== 'ready') return
    if (state.members.length === 0 || knockoutMatchIds.size === 0) return
    const headers = [
      'user_id',
      'user_name',
      'stage',
      'match_id',
      'home_team',
      'away_team',
      'pick_winner',
      'result_home_score',
      'result_away_score',
      'result_winner',
      'result_decided_by'
    ]
    const rows: Array<Record<string, CsvValue>> = []
    const predictionsByUser = new Map(exportPredictions.map((item) => [item.userId, item]))

    for (const member of state.members) {
      const predictionForMember = predictionsByUser.get(member.id)
      if (!predictionForMember) continue
      const stageEntries = Object.entries(predictionForMember.knockout ?? {}) as Array<
        [string, Record<string, MatchWinner>]
      >
      for (const [stage, stagePicks] of stageEntries) {
        for (const [matchId, winner] of Object.entries(stagePicks)) {
          if (!knockoutMatchIds.has(matchId)) continue
          const match = matchById.get(matchId)
          if (!match || match.status !== 'FINISHED') continue
          const pickWinner =
            winner === 'HOME'
              ? match.homeTeam.code
              : winner === 'AWAY'
                ? match.awayTeam.code
                : ''
          const resultWinner =
            match.winner === 'HOME'
              ? match.homeTeam.code
              : match.winner === 'AWAY'
                ? match.awayTeam.code
                : ''
          rows.push({
            user_id: member.id,
            user_name: member.name,
            stage,
            match_id: matchId,
            home_team: match.homeTeam.code,
            away_team: match.awayTeam.code,
            pick_winner: pickWinner,
            result_home_score: match.score?.home ?? '',
            result_away_score: match.score?.away ?? '',
            result_winner: resultWinner,
            result_decided_by: match.decidedBy ?? ''
          })
        }
      }
    }

    downloadCsv(formatExportFilename('bracket-knockout', exportMatchScope), headers, rows)
  }

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

      <div className="card exportPanel">
        <div className="exportHeader">
          <div>
            <div className="sectionKicker">Exports</div>
            <div className="sectionTitle">Bracket picks</div>
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
              ? 'Exports include the latest finished match per bracket.'
              : 'Exports include all finished matches.'}
          </div>
        </div>
        <div className="exportList">
          <div className="exportRow">
            <div className="exportRowText">
              <div className="exportRowTitle">Group bracket</div>
              <div className="exportRowHint">
                {exportMatchScope === 'latest'
                  ? latestGroupMatchLabel
                  : 'Groups with finished matches.'}
                {!groupComplete ? ' Best third picks unlock after groups.' : ''}
              </div>
            </div>
            <button
              type="button"
              className="button buttonSmall"
              onClick={handleExportGroup}
              disabled={!hasGroupExport}
            >
              CSV
            </button>
          </div>
          <div className="exportRow">
            <div className="exportRowText">
              <div className="exportRowTitle">Knockout bracket</div>
              <div className="exportRowHint">
                {exportMatchScope === 'latest'
                  ? latestKnockoutMatchLabel
                  : 'Finished knockout matches only.'}
              </div>
            </div>
            <button
              type="button"
              className="button buttonSmall"
              onClick={handleExportKnockout}
              disabled={!hasKnockoutExport}
            >
              CSV
            </button>
          </div>
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
        <section className="card">
          <div className="sectionHeader">
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
            const matches = knockoutDisplayMatches[stage]
            if (!matches || matches.length === 0) return null
            const stagePredictions = prediction.knockout?.[stage] ?? {}
            const stageKey = `knockout-${stage}`
            const stageCollapsed = collapsedSections[stageKey] ?? false

            return (
              <div key={stage} className="bracketStageBlock">
                <button
                  type="button"
                  className="stageToggle"
                  data-collapsed={stageCollapsed ? 'true' : 'false'}
                  onClick={() => toggleSection(stageKey)}
                  aria-expanded={!stageCollapsed}
                >
                  <span className="toggleChevron" aria-hidden="true">
                    ▾
                  </span>
                  <span className="bracketStageTitle">{stage}</span>
                  <span className="toggleMeta">
                    {matches.length} match{matches.length === 1 ? '' : 'es'}
                  </span>
                </button>
                {!stageCollapsed ? (
                  <div className="bracketStageList">
                    {matches.map((match) => {
                      const value = stagePredictions[match.id] ?? ''
                      return (
                        <div key={match.id} className="bracketMatchRow">
                          <div className="bracketMatchInfo">
                            <div className="matchTeams">
                              <div className="team">
                                <span className="teamCode">{match.displayHomeTeam.code}</span>
                                <span className="teamName">{match.displayHomeTeam.name}</span>
                              </div>
                              <div className="vs">vs</div>
                              <div className="team">
                                <span className="teamCode">{match.displayAwayTeam.code}</span>
                                <span className="teamName">{match.displayAwayTeam.name}</span>
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
                              <option value="HOME">Home ({match.displayHomeTeam.code})</option>
                              <option value="AWAY">Away ({match.displayAwayTeam.code})</option>
                            </select>
                          </label>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      ) : null}
    </div>
  )
}
