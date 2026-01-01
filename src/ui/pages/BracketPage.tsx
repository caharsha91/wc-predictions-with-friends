import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { fetchBestThirdQualifiers, fetchBracketPredictions, fetchMatches } from '../../lib/data'
import { buildGroupStandingsSnapshot, type GroupSummary } from '../../lib/exports'
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
  getLockTimePstForDateKey
} from '../../lib/matches'
import type { BracketPrediction, GroupPrediction } from '../../types/bracket'
import type { Match, MatchWinner, Team } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { useAuthState } from '../hooks/useAuthState'
import { useMediaQuery } from '../hooks/useMediaQuery'
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

type ValidationIssue = {
  id: string
  message: string
  targetId: string
  step: 'group' | 'third' | 'knockout'
}

type PickResult = 'pending' | 'correct' | 'incorrect'
type ResultSummary = 'pending' | 'partial' | 'correct' | 'incorrect'

type ResultCounts = {
  total: number
  decided: number
  correct: number
}

const pickResultLabels: Record<PickResult, string> = {
  pending: 'Pending',
  correct: 'Correct',
  incorrect: 'Incorrect'
}

const summaryResultLabels: Record<ResultSummary, string> = {
  pending: 'Pending',
  partial: 'Partial',
  correct: 'Correct',
  incorrect: 'Incorrect'
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

function recordResult(status: PickResult, counts: ResultCounts) {
  counts.total += 1
  if (status !== 'pending') counts.decided += 1
  if (status === 'correct') counts.correct += 1
}

function resolvePickStatus(pick: string | undefined, actualSet: Set<string> | null): PickResult {
  if (!actualSet || actualSet.size === 0) return 'pending'
  if (!pick) return 'incorrect'
  return actualSet.has(pick) ? 'correct' : 'incorrect'
}

function resolveKnockoutPickStatus(match: Match, pick?: MatchWinner): PickResult {
  if (match.status !== 'FINISHED' || !match.winner) return 'pending'
  if (!pick) return 'incorrect'
  return pick === match.winner ? 'correct' : 'incorrect'
}

function resolveSummaryStatus(counts: ResultCounts): ResultSummary {
  if (counts.total === 0 || counts.decided === 0) return 'pending'
  if (counts.decided < counts.total) return 'partial'
  if (counts.correct === counts.total) return 'correct'
  if (counts.correct === 0) return 'incorrect'
  return 'partial'
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    groupStep: false,
    thirdStep: true,
    knockoutStep: true
  })
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [activeRound, setActiveRound] = useState<KnockoutStage | null>(null)
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

  const groupStandings = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, GroupSummary>()
    return buildGroupStandingsSnapshot(state.matches)
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

  const availableRounds = useMemo(() => {
    return knockoutStageOrder.filter(
      (stage) => (knockoutDisplayMatches[stage]?.length ?? 0) > 0
    )
  }, [knockoutDisplayMatches])

  useEffect(() => {
    if (availableRounds.length === 0) {
      setActiveRound(null)
      return
    }
    setActiveRound((current) =>
      current && availableRounds.includes(current) ? current : availableRounds[0]
    )
  }, [availableRounds])

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

  const knockoutOpenTime = useMemo(() => {
    if (groupMatchDates.length === 0) return null
    return getLockTimePstForDateKey(groupMatchDates[groupMatchDates.length - 1], 0)
  }, [groupMatchDates])

  const knockoutLockTime = useMemo(() => {
    if (knockoutMatchDates.length === 0) return null
    return getLockTimePstForDateKey(knockoutMatchDates[0], -1)
  }, [knockoutMatchDates])

  const now = useNow()
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const knockoutLocked = knockoutLockTime ? now.getTime() >= knockoutLockTime.getTime() : false
  const bracketCardHeight = 92
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

  const groupPickResults = useMemo(() => {
    const results = new Map<string, { first: PickResult; second: PickResult }>()
    const summary: ResultCounts = { total: 0, decided: 0, correct: 0 }
    if (!prediction) return { results, summary }
    for (const groupId of groupIds) {
      const group = prediction.groups[groupId] ?? {}
      const summaryData = groupStandings.get(groupId)
      const actualTopTwo = summaryData?.complete
        ? summaryData.standings.slice(0, 2).map((entry) => entry.team.code)
        : []
      const actualSet = summaryData?.complete ? new Set(actualTopTwo) : null
      const firstResult = resolvePickStatus(group.first, actualSet)
      const secondResult = resolvePickStatus(group.second, actualSet)
      results.set(groupId, { first: firstResult, second: secondResult })
      recordResult(firstResult, summary)
      recordResult(secondResult, summary)
    }
    return { results, summary }
  }, [groupIds, groupStandings, prediction])

  const thirdPickResults = useMemo(() => {
    const results: PickResult[] = []
    const summary: ResultCounts = { total: 0, decided: 0, correct: 0 }
    if (!prediction) return { results, summary }
    const qualifiersReady =
      state.status === 'ready' && state.bestThirdQualifiers.length >= 8
    const qualifiers = qualifiersReady ? new Set(state.bestThirdQualifiers) : null
    for (let index = 0; index < 8; index += 1) {
      const pick = prediction.bestThirds?.[index] ?? ''
      const status = resolvePickStatus(pick, qualifiers)
      results[index] = status
      recordResult(status, summary)
    }
    return { results, summary }
  }, [prediction, state.bestThirdQualifiers, state.status])

  const knockoutPickResults = useMemo(() => {
    const results = new Map<string, PickResult>()
    const summary: ResultCounts = { total: 0, decided: 0, correct: 0 }
    if (!prediction) return { results, summary }
    for (const stage of knockoutStageOrder) {
      const matches = knockoutDisplayMatches[stage] ?? []
      const stagePredictions = prediction.knockout?.[stage] ?? {}
      for (const match of matches) {
        const status = resolveKnockoutPickStatus(match, stagePredictions[match.id])
        results.set(match.id, status)
        recordResult(status, summary)
      }
    }
    return { results, summary }
  }, [knockoutDisplayMatches, prediction])

  const validation = useMemo(() => {
    const groupErrors: Record<string, { first?: string; second?: string }> = {}
    const thirdErrors: string[] = []
    const knockoutErrors: Record<string, string> = {}
    const issues: ValidationIssue[] = []

    if (!prediction) {
      return { groupErrors, thirdErrors, knockoutErrors, issues }
    }

    for (const groupId of groupIds) {
      const group = prediction.groups[groupId] ?? {}
      const first = group.first ?? ''
      const second = group.second ?? ''
      if (first && second && first === second) {
        groupErrors[groupId] = {
          first: 'Pick two different teams.',
          second: 'Pick two different teams.'
        }
        issues.push({
          id: `group-${groupId}-first`,
          message: `Group ${groupId}: pick two different teams.`,
          targetId: `group-${groupId}-first`,
          step: 'group'
        })
        issues.push({
          id: `group-${groupId}-second`,
          message: `Group ${groupId}: pick two different teams.`,
          targetId: `group-${groupId}-second`,
          step: 'group'
        })
        continue
      }
      if (!first) {
        groupErrors[groupId] = { ...groupErrors[groupId], first: 'Select a 1st-place team.' }
        issues.push({
          id: `group-${groupId}-first`,
          message: `Group ${groupId}: select a 1st-place team.`,
          targetId: `group-${groupId}-first`,
          step: 'group'
        })
      }
      if (!second) {
        groupErrors[groupId] = { ...groupErrors[groupId], second: 'Select a 2nd-place team.' }
        issues.push({
          id: `group-${groupId}-second`,
          message: `Group ${groupId}: select a 2nd-place team.`,
          targetId: `group-${groupId}-second`,
          step: 'group'
        })
      }
    }

    const thirdSlots = [...(prediction.bestThirds ?? [])]
    while (thirdSlots.length < 8) thirdSlots.push('')
    const duplicates = new Map<string, number[]>()
    thirdSlots.forEach((code, index) => {
      if (!code) return
      const list = duplicates.get(code) ?? []
      list.push(index)
      duplicates.set(code, list)
    })
    const duplicateSlots = new Set<number>()
    for (const indices of duplicates.values()) {
      if (indices.length > 1) indices.forEach((index) => duplicateSlots.add(index))
    }
    thirdSlots.forEach((code, index) => {
      if (!code) {
        thirdErrors[index] = 'Select a team.'
        issues.push({
          id: `third-${index}`,
          message: `Third-place slot ${index + 1}: select a team.`,
          targetId: `third-${index}`,
          step: 'third'
        })
        return
      }
      if (duplicateSlots.has(index)) {
        thirdErrors[index] = 'Team already used in another slot.'
        issues.push({
          id: `third-${index}`,
          message: `Third-place slot ${index + 1}: team already used.`,
          targetId: `third-${index}`,
          step: 'third'
        })
      }
    })

    if (knockoutUnlocked) {
      for (const stage of knockoutStageOrder) {
        const matches = knockoutMatches[stage] ?? []
        const stagePredictions = prediction.knockout?.[stage]
        for (const match of matches) {
          if (stagePredictions?.[match.id]) continue
          knockoutErrors[match.id] = 'Pick a winner.'
          issues.push({
            id: `knockout-${match.id}`,
            message: `${stage}: pick a winner.`,
            targetId: `knockout-${match.id}`,
            step: 'knockout'
          })
        }
      }
    }

    return { groupErrors, thirdErrors, knockoutErrors, issues }
  }, [groupIds, knockoutMatches, knockoutUnlocked, prediction])

  const issueCount = validation.issues.length
  const firstIssue = validation.issues[0]
  const groupComplete = missingGroups === 0
  const thirdComplete = missingThirds === 0
  const knockoutComplete = missingKnockout === 0

  function scrollToTarget(targetId: string) {
    const target = document.getElementById(targetId)
    if (target) {
      target.scrollIntoView({ block: 'center' })
    }
  }

  function openStep(step: ValidationIssue['step']) {
    const key =
      step === 'group' ? 'groupStep' : step === 'third' ? 'thirdStep' : 'knockoutStep'
    setCollapsedSections((current) => ({ ...current, [key]: false }))
  }

  function handleJumpToIssue(issue: ValidationIssue) {
    openStep(issue.step)
    requestAnimationFrame(() => {
      scrollToTarget(issue.targetId)
    })
  }

  function handleJumpToStep(
    stepId: 'bracket-step-group' | 'bracket-step-third' | 'bracket-step-knockout'
  ) {
    if (stepId === 'bracket-step-group') openStep('group')
    if (stepId === 'bracket-step-third') openStep('third')
    if (stepId === 'bracket-step-knockout') openStep('knockout')
    requestAnimationFrame(() => {
      scrollToTarget(stepId)
    })
  }

  function handleJumpToRound(roundKey: string, stage?: KnockoutStage) {
    if (stage) setActiveRound(stage)
    scrollToTarget(`bracket-round-${roundKey}`)
  }

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>
  if (!prediction) return null
  const groupStepCollapsed = collapsedSections.groupStep ?? false
  const thirdStepCollapsed = collapsedSections.thirdStep ?? false
  const knockoutStepCollapsed = collapsedSections.knockoutStep ?? false
  const activeRoundMatches =
    activeRound && knockoutDisplayMatches[activeRound]
      ? knockoutDisplayMatches[activeRound]
      : []
  const groupStatusLabel = groupLocked
    ? 'Locked'
    : groupComplete
      ? 'Complete'
      : `${missingGroups} missing`
  const groupResultStatus = resolveSummaryStatus(groupPickResults.summary)
  const thirdStatusLabel = groupLocked
    ? 'Locked'
    : thirdComplete
      ? 'Complete'
      : `${missingThirds} missing`
  const thirdResultStatus = resolveSummaryStatus(thirdPickResults.summary)
  const knockoutStatusLabel = !knockoutUnlocked
    ? 'Locked'
    : knockoutLocked
      ? 'Locked'
      : knockoutComplete
        ? 'Complete'
        : `${missingKnockout} missing`
  const knockoutResultStatus = resolveSummaryStatus(knockoutPickResults.summary)
  const knockoutStatusNote = knockoutLocked
    ? knockoutLockTime
      ? `Locked since ${formatLockTime(knockoutLockTime)}`
      : null
    : !knockoutUnlocked
      ? knockoutOpenTime
        ? `Opens at ${formatLockTime(knockoutOpenTime)}`
        : null
      : knockoutLockTime
        ? `Locks at ${formatLockTime(knockoutLockTime)}`
        : null

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

      {issueCount > 0 ? (
        <div className="card validationBanner" role="status">
          <div className="validationBannerInfo">
            <div className="validationBannerTitle">Action needed</div>
            <div className="validationBannerMeta">
              {issueCount === 1 ? '1 pick needs attention.' : `${issueCount} picks need attention.`}
            </div>
            {firstIssue ? (
              <div className="validationBannerIssue">{firstIssue.message}</div>
            ) : null}
          </div>
          {firstIssue ? (
            <button
              className="button buttonSecondary buttonSmall"
              type="button"
              onClick={() => handleJumpToIssue(firstIssue)}
            >
              Jump to first pick
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="bracketStepper" role="list">
        <button
          type="button"
          className="bracketStepNav"
          role="listitem"
          onClick={() => handleJumpToStep('bracket-step-group')}
        >
          <span className="bracketStepIndex">1</span>
          <span className="bracketStepNavText">
            <span className="bracketStepNavTitle">Group qualifiers</span>
            <span className="bracketStepNavMeta">{groupIds.length} groups</span>
          </span>
          <div className="bracketStepBadges">
            <span
              className="bracketStepStatus"
              data-status={groupLocked ? 'locked' : groupComplete ? 'complete' : 'pending'}
            >
              {groupStatusLabel}
            </span>
            <span className="bracketResultTag" data-status={groupResultStatus}>
              {summaryResultLabels[groupResultStatus]}
            </span>
          </div>
        </button>
        <button
          type="button"
          className="bracketStepNav"
          role="listitem"
          onClick={() => handleJumpToStep('bracket-step-third')}
        >
          <span className="bracketStepIndex">2</span>
          <span className="bracketStepNavText">
            <span className="bracketStepNavTitle">Third-place flow</span>
            <span className="bracketStepNavMeta">8 slots</span>
          </span>
          <div className="bracketStepBadges">
            <span
              className="bracketStepStatus"
              data-status={groupLocked ? 'locked' : thirdComplete ? 'complete' : 'pending'}
            >
              {thirdStatusLabel}
            </span>
            <span className="bracketResultTag" data-status={thirdResultStatus}>
              {summaryResultLabels[thirdResultStatus]}
            </span>
          </div>
        </button>
        <button
          type="button"
          className="bracketStepNav"
          role="listitem"
          onClick={() => handleJumpToStep('bracket-step-knockout')}
        >
          <span className="bracketStepIndex">3</span>
          <span className="bracketStepNavText">
            <span className="bracketStepNavTitle">Knockout bracket</span>
            <span className="bracketStepNavMeta">
              {availableRounds.length} round{availableRounds.length === 1 ? '' : 's'}
            </span>
          </span>
          <div className="bracketStepBadges">
            <span
              className="bracketStepStatus"
              data-status={
                !knockoutUnlocked || knockoutLocked
                  ? 'locked'
                  : knockoutComplete
                    ? 'complete'
                    : 'pending'
              }
            >
              {knockoutStatusLabel}
            </span>
            <span className="bracketResultTag" data-status={knockoutResultStatus}>
              {summaryResultLabels[knockoutResultStatus]}
            </span>
          </div>
        </button>
      </div>

      <section
        id="bracket-step-group"
        className="card bracketStep"
        data-status={groupLocked ? 'locked' : groupComplete ? 'complete' : 'pending'}
      >
        <div className="bracketStepHeader">
          <button
            type="button"
            className="sectionToggle bracketStepToggle"
            data-collapsed={groupStepCollapsed ? 'true' : 'false'}
            onClick={() => toggleSection('groupStep')}
            aria-expanded={!groupStepCollapsed}
          >
            <span className="toggleChevron" aria-hidden="true">
              ▾
            </span>
            <span className="bracketStepTitle">Step 1 · Group qualifiers</span>
          </button>
          <div className="bracketStepMeta">
            <span
              className="bracketStepStatus"
              data-status={groupLocked ? 'locked' : groupComplete ? 'complete' : 'pending'}
            >
              {groupStatusLabel}
            </span>
            {groupLockTime ? (
              <div className="lockNote">
                {groupLocked
                  ? `Locked since ${formatLockTime(groupLockTime)}`
                  : `Locks at ${formatLockTime(groupLockTime)}`}
              </div>
            ) : null}
          </div>
        </div>
        {!groupStepCollapsed ? (
          <div className="bracketStepBody">
            <div className="bracketGuide bracketGuideCompact">
              <div className="sectionTitle">Group stage guide</div>
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
                  const errors = validation.groupErrors[groupId] ?? {}
                  const hasError = Boolean(errors.first || errors.second)
                  const groupResult = groupPickResults.results.get(groupId)
                  const firstResult = groupResult?.first ?? 'pending'
                  const secondResult = groupResult?.second ?? 'pending'

                  return (
                    <div
                      key={groupId}
                      className={hasError ? 'bracketGroupCard bracketGroupCardError' : 'bracketGroupCard'}
                    >
                      <div className="bracketGroupHeader">Group {groupId}</div>
                      <label className="pickLabel" data-error={errors.first ? 'true' : 'false'}>
                        <span className="pickLabelRow">
                          <span>1st place</span>
                          <span className="bracketResultTag" data-status={firstResult}>
                            {pickResultLabels[firstResult]}
                          </span>
                        </span>
                        <select
                          id={`group-${groupId}-first`}
                          className="pickSelect"
                          value={firstValue}
                          disabled={groupLocked}
                          aria-invalid={Boolean(errors.first)}
                          aria-describedby={errors.first ? `group-${groupId}-first-error` : undefined}
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
                        {errors.first ? (
                          <span className="fieldError" id={`group-${groupId}-first-error`}>
                            {errors.first}
                          </span>
                        ) : null}
                      </label>
                      <label className="pickLabel" data-error={errors.second ? 'true' : 'false'}>
                        <span className="pickLabelRow">
                          <span>2nd place</span>
                          <span className="bracketResultTag" data-status={secondResult}>
                            {pickResultLabels[secondResult]}
                          </span>
                        </span>
                        <select
                          id={`group-${groupId}-second`}
                          className="pickSelect"
                          value={secondValue}
                          disabled={groupLocked}
                          aria-invalid={Boolean(errors.second)}
                          aria-describedby={errors.second ? `group-${groupId}-second-error` : undefined}
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
                        {errors.second ? (
                          <span className="fieldError" id={`group-${groupId}-second-error`}>
                            {errors.second}
                          </span>
                        ) : null}
                      </label>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section
        id="bracket-step-third"
        className="card bracketStep"
        data-status={groupLocked ? 'locked' : thirdComplete ? 'complete' : 'pending'}
      >
        <div className="bracketStepHeader">
          <button
            type="button"
            className="sectionToggle bracketStepToggle"
            data-collapsed={thirdStepCollapsed ? 'true' : 'false'}
            onClick={() => toggleSection('thirdStep')}
            aria-expanded={!thirdStepCollapsed}
          >
            <span className="toggleChevron" aria-hidden="true">
              ▾
            </span>
            <span className="bracketStepTitle">Step 2 · Third-place flow</span>
          </button>
          <div className="bracketStepMeta">
            <span
              className="bracketStepStatus"
              data-status={groupLocked ? 'locked' : thirdComplete ? 'complete' : 'pending'}
            >
              {thirdStatusLabel}
            </span>
            {groupLockTime ? (
              <div className="lockNote">
                {groupLocked
                  ? `Locked since ${formatLockTime(groupLockTime)}`
                  : `Locks at ${formatLockTime(groupLockTime)}`}
              </div>
            ) : null}
          </div>
        </div>
        {!thirdStepCollapsed ? (
          <div className="bracketStepBody">
            <div className="bracketGuide bracketGuideCompact">
              <div className="sectionTitle">Third-place guide</div>
              <div className="bracketGuideContent">
                <p>
                  Pick eight third-place qualifiers. Duplicate teams are not allowed, so each slot
                  must be unique.
                </p>
              </div>
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
                  const error = validation.thirdErrors[index]
                  const resultStatus = thirdPickResults.results[index] ?? 'pending'
                  return (
                    <label key={`third-${index}`} className="pickLabel" data-error={error ? 'true' : 'false'}>
                      <span className="pickLabelRow">
                        <span>Slot {index + 1}</span>
                        <span className="bracketResultTag" data-status={resultStatus}>
                          {pickResultLabels[resultStatus]}
                        </span>
                      </span>
                      <select
                        id={`third-${index}`}
                        className="pickSelect"
                        value={selected}
                        disabled={groupLocked}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `third-${index}-error` : undefined}
                        onChange={(event) => handleBestThirdChange(index, event.target.value)}
                      >
                        <option value="">Select team</option>
                        {options.map((team) => (
                          <option key={team.code} value={team.code}>
                            {team.code} - {team.name}
                          </option>
                        ))}
                      </select>
                      {error ? (
                        <span className="fieldError" id={`third-${index}-error`}>
                          {error}
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section
        id="bracket-step-knockout"
        className="card bracketStep"
        data-status={
          !knockoutUnlocked || knockoutLocked ? 'locked' : knockoutComplete ? 'complete' : 'pending'
        }
      >
        <div className="bracketStepHeader">
          <button
            type="button"
            className="sectionToggle bracketStepToggle"
            data-collapsed={knockoutStepCollapsed ? 'true' : 'false'}
            onClick={() => toggleSection('knockoutStep')}
            aria-expanded={!knockoutStepCollapsed}
          >
            <span className="toggleChevron" aria-hidden="true">
              ▾
            </span>
            <span className="bracketStepTitle">Step 3 · Knockout bracket</span>
          </button>
          <div className="bracketStepMeta">
            <span
              className="bracketStepStatus"
              data-status={
                !knockoutUnlocked || knockoutLocked
                  ? 'locked'
                  : knockoutComplete
                    ? 'complete'
                    : 'pending'
              }
            >
              {knockoutStatusLabel}
            </span>
            {knockoutStatusNote ? <div className="lockNote">{knockoutStatusNote}</div> : null}
          </div>
        </div>
        {!knockoutStepCollapsed ? (
          <div className="bracketStepBody">
            {!knockoutUnlocked ? (
              <div className="bracketLockCallout">
                Knockout predictions unlock after group stage completion, the best third-place
                qualifiers are published, and the knockout draw is available.
              </div>
            ) : (
              <>
                <div className="bracketGuide bracketGuideCompact">
                  <div className="sectionTitle">Knockout guide</div>
                  <div className="bracketGuideContent">
                    <p>
                      Select the winner for each knockout fixture. Picks are made directly on the team
                      pills. Your final pick drives the champion badge once selected.
                    </p>
                  </div>
                </div>
                {isMobile ? (
                  <div className="bracketRoundsMobile">
                    <div className="bracketRoundTabs" role="tablist" aria-label="Knockout rounds">
                      {availableRounds.map((stage) => (
                        <button
                          key={stage}
                          type="button"
                          role="tab"
                          aria-selected={stage === activeRound}
                          className={stage === activeRound ? 'bracketRoundTab active' : 'bracketRoundTab'}
                          onClick={() => setActiveRound(stage)}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                    <div className="bracketRoundList">
                      {activeRoundMatches.length === 0 ? (
                        <div className="muted">No matches available for this round yet.</div>
                      ) : (
                        activeRoundMatches.map((match) => {
                          const stage = match.stage as KnockoutStage
                          const stagePredictions = prediction.knockout?.[stage] ?? {}
                          const value = stagePredictions[match.id] ?? ''
                          const resultStatus = knockoutPickResults.results.get(match.id) ?? 'pending'
                          const championTeam =
                            stage === 'Final'
                              ? value === 'HOME'
                                ? match.displayHomeTeam
                                : value === 'AWAY'
                                  ? match.displayAwayTeam
                                  : null
                              : null
                          const error = validation.knockoutErrors[match.id]
                          return (
                            <div
                              key={match.id}
                              className={error ? 'bracketRoundMatch bracketRoundMatchError' : 'bracketRoundMatch'}
                              id={`knockout-${match.id}`}
                            >
                              <div className="bracketRoundMatchHeader">
                                <span className="bracketRoundMatchTitle">
                                  <span className="bracketRoundStage">{stage}</span>
                                  <span className="bracketResultTag" data-status={resultStatus}>
                                    {pickResultLabels[resultStatus]}
                                  </span>
                                </span>
                                <span className="bracketRoundKickoff">
                                  {formatKickoff(match.kickoffUtc)}
                                </span>
                              </div>
                              <div className="bracketRoundTeams">
                                <button
                                  type="button"
                                  className={
                                    value === 'HOME'
                                      ? 'bracketTeamPick bracketTeamPickLarge active'
                                      : 'bracketTeamPick bracketTeamPickLarge'
                                  }
                                  disabled={knockoutLocked}
                                  aria-pressed={value === 'HOME'}
                                  onClick={() => handleKnockoutChange(match, 'HOME')}
                                >
                                  {match.displayHomeTeam.code}
                                </button>
                                <button
                                  type="button"
                                  className={
                                    value === 'AWAY'
                                      ? 'bracketTeamPick bracketTeamPickLarge active'
                                      : 'bracketTeamPick bracketTeamPickLarge'
                                  }
                                  disabled={knockoutLocked}
                                  aria-pressed={value === 'AWAY'}
                                  onClick={() => handleKnockoutChange(match, 'AWAY')}
                                >
                                  {match.displayAwayTeam.code}
                                </button>
                              </div>
                              <div className="bracketRoundTeamsMeta">
                                <span className="teamName">{match.displayHomeTeam.name}</span>
                                <span className="vs">vs</span>
                                <span className="teamName">{match.displayAwayTeam.name}</span>
                              </div>
                              {error ? (
                                <div className="fieldError" id={`knockout-${match.id}-error`}>
                                  {error}
                                </div>
                              ) : null}
                              {stage === 'Final' ? (
                                <div className="bracketChampionBadge bracketChampionBadgeInline">
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
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bracketRoundsDesktop">
                    <div className="bracketRoundNav" role="tablist" aria-label="Knockout rounds">
                      {knockoutColumns.map((column) => (
                        <button
                          key={column.key}
                          type="button"
                          role="tab"
                          className={
                            activeRound && column.stages.includes(activeRound)
                              ? 'bracketRoundButton active'
                              : 'bracketRoundButton'
                          }
                          aria-selected={activeRound ? column.stages.includes(activeRound) : false}
                          onClick={() => handleJumpToRound(column.key, column.stages[0])}
                        >
                          {column.title}
                        </button>
                      ))}
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
                            id={`bracket-round-${column.key}`}
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
                                      const resultStatus = knockoutPickResults.results.get(match.id) ?? 'pending'
                                      const championTeam =
                                        stage === 'Final'
                                          ? value === 'HOME'
                                            ? match.displayHomeTeam
                                            : value === 'AWAY'
                                              ? match.displayAwayTeam
                                              : null
                                          : null
                                      const error = validation.knockoutErrors[match.id]
                                      return (
                                        <div
                                          key={match.id}
                                          className={
                                            error
                                              ? 'bracketMatchCard bracketMatchCardError'
                                              : 'bracketMatchCard'
                                          }
                                          id={`knockout-${match.id}`}
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
                                            <div className="bracketMatchMeta">
                                              {column.stages.length > 1 ? (
                                                <div className="bracketMatchStageLabel">{stage}</div>
                                              ) : null}
                                              <span className="bracketResultTag" data-status={resultStatus}>
                                                {pickResultLabels[resultStatus]}
                                              </span>
                                            </div>
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
                                          {error ? (
                                            <div className="bracketMatchError" id={`knockout-${match.id}-error`}>
                                              {error}
                                            </div>
                                          ) : null}
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
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
