import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { fetchBestThirdQualifiers } from '../../lib/data'
import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useRouteDataMode } from '../hooks/useRouteDataMode'

const BEST_THIRD_SLOTS = 8

type GroupStanding = {
  code: string
  points: number
  gd: number
  gf: number
}

type PredictionResult = 'correct' | 'wrong' | 'pending'

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groups = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teamMap = groups.get(match.group) ?? new Map<string, Team>()
    teamMap.set(match.homeTeam.code, match.homeTeam)
    teamMap.set(match.awayTeam.code, match.awayTeam)
    groups.set(match.group, teamMap)
  }

  const next: Record<string, Team[]> = {}
  for (const [groupId, teamMap] of groups.entries()) {
    next[groupId] = [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return next
}

function normalizeBestThirds(bestThirds: string[]): string[] {
  const next = [...bestThirds]
  while (next.length < BEST_THIRD_SLOTS) next.push('')
  return next.slice(0, BEST_THIRD_SLOTS)
}

function getCompletionCount(groups: Record<string, GroupPrediction>, groupIds: string[]) {
  let complete = 0
  for (const groupId of groupIds) {
    const group = groups[groupId] ?? {}
    if (group.first && group.second && group.first !== group.second) {
      complete += 1
    }
  }
  return complete
}

function computeGroupStandings(matches: Match[]): {
  standingsByGroup: Map<string, GroupStanding[]>
  completeGroups: Set<string>
  totalMatchesByGroup: Map<string, number>
  finishedMatchesByGroup: Map<string, number>
} {
  const tables = new Map<string, Map<string, GroupStanding>>()
  const totalPerGroup = new Map<string, number>()
  const finishedPerGroup = new Map<string, number>()

  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    totalPerGroup.set(match.group, (totalPerGroup.get(match.group) ?? 0) + 1)

    const groupTable = tables.get(match.group) ?? new Map<string, GroupStanding>()
    if (!groupTable.has(match.homeTeam.code)) {
      groupTable.set(match.homeTeam.code, { code: match.homeTeam.code, points: 0, gd: 0, gf: 0 })
    }
    if (!groupTable.has(match.awayTeam.code)) {
      groupTable.set(match.awayTeam.code, { code: match.awayTeam.code, points: 0, gd: 0, gf: 0 })
    }
    tables.set(match.group, groupTable)

    if (match.status !== 'FINISHED' || !match.score) continue

    finishedPerGroup.set(match.group, (finishedPerGroup.get(match.group) ?? 0) + 1)

    const home = groupTable.get(match.homeTeam.code)
    const away = groupTable.get(match.awayTeam.code)
    if (!home || !away) continue

    home.gf += match.score.home
    away.gf += match.score.away
    home.gd += match.score.home - match.score.away
    away.gd += match.score.away - match.score.home

    if (match.score.home > match.score.away) {
      home.points += 3
    } else if (match.score.home < match.score.away) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }
  }

  const standingsByGroup = new Map<string, GroupStanding[]>()
  for (const [groupId, table] of tables.entries()) {
    const sorted = [...table.values()].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      if (b.gd !== a.gd) return b.gd - a.gd
      if (b.gf !== a.gf) return b.gf - a.gf
      return a.code.localeCompare(b.code)
    })
    standingsByGroup.set(groupId, sorted)
  }

  const completeGroups = new Set<string>()
  for (const [groupId, total] of totalPerGroup.entries()) {
    if ((finishedPerGroup.get(groupId) ?? 0) >= total) completeGroups.add(groupId)
  }

  return {
    standingsByGroup,
    completeGroups,
    totalMatchesByGroup: totalPerGroup,
    finishedMatchesByGroup: finishedPerGroup
  }
}

function resultTone(status: PredictionResult): 'success' | 'danger' | 'secondary' {
  if (status === 'correct') return 'success'
  if (status === 'wrong') return 'danger'
  return 'secondary'
}

function resultLabel(status: PredictionResult): string {
  if (status === 'correct') return 'Correct'
  if (status === 'wrong') return 'Wrong'
  return 'Pending'
}

function resultSurfaceClass(status: PredictionResult): string {
  if (status === 'correct') return 'bg-[rgba(var(--primary-rgb),0.08)]'
  if (status === 'wrong') return 'bg-[rgba(var(--danger-rgb),0.08)]'
  return 'bg-bg2/40'
}

function formatTeam(code: string | undefined, teams: Team[]): string {
  if (!code) return '—'
  const team = teams.find((entry) => entry.code === code)
  return team ? `${team.code} · ${team.name}` : code
}

export default function GroupStagePage() {
  const location = useLocation()
  const mode = useRouteDataMode()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)
  const [qualifiersState, setQualifiersState] = useState<{
    status: 'loading' | 'ready' | 'error'
    qualifiers: string[]
    message?: string
  }>({ status: 'loading', qualifiers: [] })

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks') =>
    segment ? `${playRoot}/${segment}` : playRoot

  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const groupIds = groupStage.groupIds
  const bestThirds = normalizeBestThirds(groupStage.data.bestThirds)
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false

  const completion = useMemo(() => {
    const groupsDone = getCompletionCount(groupStage.data.groups, groupIds)
    const bestThirdDone = bestThirds.filter(Boolean).length
    return { groupsDone, bestThirdDone }
  }, [bestThirds, groupIds, groupStage.data.groups])

  const standings = useMemo(() => computeGroupStandings(matches), [matches])
  const qualifiersSet = useMemo(() => new Set(qualifiersState.qualifiers), [qualifiersState.qualifiers])
  const groupsFinal = completion.groupsDone === groupIds.length && groupIds.length > 0
  const bestThirdsFinal = groupsFinal && qualifiersState.qualifiers.length >= BEST_THIRD_SLOTS

  useEffect(() => {
    let canceled = false
    async function loadQualifiers() {
      setQualifiersState({ status: 'loading', qualifiers: [] })
      try {
        const result = await fetchBestThirdQualifiers({ mode })
        if (canceled) return
        setQualifiersState({ status: 'ready', qualifiers: result.qualifiers ?? [] })
      } catch (error) {
        if (canceled) return
        const message = error instanceof Error ? error.message : 'Unknown error'
        setQualifiersState({ status: 'error', qualifiers: [], message })
      }
    }
    void loadQualifiers()
    return () => {
      canceled = true
    }
  }, [mode])

  if (picksState.state.status === 'loading' || groupStage.loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {picksState.state.message}
      </Alert>
    )
  }

  if (groupStage.loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load group stage">
        {groupStage.loadState.message}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Group stage"
        title="Group Stage Detail"
        subtitle="Read-only group predictions and standings. Use Play Center for guided edits."
        meta={
          <div className="flex items-start gap-3 text-right">
            <ButtonLink to={toPlayPath('picks')} size="sm" variant="primary">
              Back to Picks
            </ButtonLink>
            <div className="text-xs text-muted-foreground" data-last-updated="true">
              <div className="uppercase tracking-[0.2em]">Last updated</div>
              <div className="text-sm font-semibold text-foreground">
                {formatTime(picksState.state.lastUpdated)}
              </div>
            </div>
          </div>
        }
      >
        <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={completion.groupsDone === groupIds.length && groupIds.length > 0 ? 'success' : 'warning'}>
                Groups {completion.groupsDone}/{groupIds.length}
              </Badge>
              <Badge tone={completion.bestThirdDone === BEST_THIRD_SLOTS ? 'success' : 'warning'}>
                Best thirds {completion.bestThirdDone}/{BEST_THIRD_SLOTS}
              </Badge>
              <Badge tone={groupClosed ? 'locked' : 'info'}>
                {groupClosed
                  ? `Closed ${formatTime(groupLockTime?.toISOString())}`
                  : `Closes ${formatTime(groupLockTime?.toISOString())}`}
              </Badge>
            </div>

            {groupClosed ? (
              <Alert tone="info" title="Group stage is closed">
                Detail view only. Selections are visible with embedded standings below.
              </Alert>
            ) : null}

            <Table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Status</th>
                  <th>Your pick (1st)</th>
                  <th>Result (1st)</th>
                  <th>Your pick (2nd)</th>
                  <th>Result (2nd)</th>
                </tr>
              </thead>
              <tbody>
                {groupIds.map((groupId) => {
                  const teams = groupTeams[groupId] ?? []
                  const prediction = groupStage.data.groups[groupId] ?? {}
                  const groupStandings = standings.standingsByGroup.get(groupId) ?? []
                  const complete = standings.completeGroups.has(groupId)
                  const actualTopTwo = groupStandings.slice(0, 2).map((entry) => entry.code)
                  const finishedCount = standings.finishedMatchesByGroup.get(groupId) ?? 0
                  const totalCount = standings.totalMatchesByGroup.get(groupId) ?? 0

                  const firstResult: PredictionResult = !complete
                    ? 'pending'
                    : prediction.first === actualTopTwo[0]
                      ? 'correct'
                      : 'wrong'
                  const secondResult: PredictionResult = !complete
                    ? 'pending'
                    : prediction.second === actualTopTwo[1]
                      ? 'correct'
                      : 'wrong'
                  const rowResult: PredictionResult = !complete
                    ? 'pending'
                    : firstResult === 'correct' && secondResult === 'correct'
                      ? 'correct'
                      : 'wrong'
                  const statusLabel = complete ? 'Final' : 'Incomplete'

                  return (
                    <tr key={groupId} className={resultSurfaceClass(rowResult)}>
                      <td>
                        <div className="font-semibold text-foreground">Group {groupId}</div>
                        <div className="text-xs text-muted-foreground">{finishedCount}/{totalCount} matches finished</div>
                      </td>
                      <td>
                        <Badge tone={complete ? 'success' : 'secondary'}>{statusLabel}</Badge>
                      </td>
                      <td>{formatTeam(prediction.first, teams)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={resultTone(firstResult)}>{resultLabel(firstResult)}</Badge>
                          {firstResult === 'correct' ? null : (
                            <span className="text-xs text-muted-foreground">Actual: {actualTopTwo[0] ?? '—'}</span>
                          )}
                        </div>
                      </td>
                      <td>{formatTeam(prediction.second, teams)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={resultTone(secondResult)}>{resultLabel(secondResult)}</Badge>
                          {secondResult === 'correct' ? null : (
                            <span className="text-xs text-muted-foreground">Actual: {actualTopTwo[1] ?? '—'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </Card>
      </PageHeroPanel>

      <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">Best 8 third-place qualifiers</div>
            <Badge tone={bestThirdsFinal ? 'success' : 'secondary'}>
              {bestThirdsFinal ? 'Final' : 'Incomplete'}
            </Badge>
          </div>
          {qualifiersState.status === 'ready' ? (
            <div className="text-xs text-muted-foreground">
              Actual qualifiers: {qualifiersState.qualifiers.length > 0 ? qualifiersState.qualifiers.join(', ') : '—'}
            </div>
          ) : null}
          {qualifiersState.status === 'error' ? (
            <Alert tone="warning" title="Unable to load best-third qualifiers">
              {qualifiersState.message}
            </Alert>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bestThirds.map((teamCode, index) => {
              const qualifierResult: PredictionResult = !bestThirdsFinal
                ? 'pending'
                : teamCode && qualifiersSet.has(teamCode)
                  ? 'correct'
                  : 'wrong'
              return (
                <div
                  key={`best-third-${index}`}
                  className={`rounded-xl border border-border/70 px-3 py-2 ${resultSurfaceClass(qualifierResult)}`}
                >
                  <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Slot {index + 1}</div>
                  <div className="text-sm font-semibold text-foreground">Pick: {teamCode || '—'}</div>
                  <div className="mt-1">
                    <Badge tone={resultTone(qualifierResult)}>{resultLabel(qualifierResult)}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}
