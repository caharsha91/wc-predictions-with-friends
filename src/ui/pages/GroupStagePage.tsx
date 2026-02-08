import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import DetailQuickMenu from '../components/ui/DetailQuickMenu'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'

const BEST_THIRD_SLOTS = 8

type GroupStanding = {
  code: string
  points: number
  gd: number
  gf: number
}

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

  return { standingsByGroup, completeGroups }
}

function formatTeam(code: string | undefined, teams: Team[]): string {
  if (!code) return '—'
  const team = teams.find((entry) => entry.code === code)
  return team ? `${team.code} · ${team.name}` : code
}

export default function GroupStagePage() {
  const location = useLocation()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks' | 'group-stage' | 'bracket' | 'league') =>
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
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">
              {formatTime(picksState.state.lastUpdated)}
            </div>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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
                    <th>Your 1st</th>
                    <th>Your 2nd</th>
                    <th>Result status</th>
                  </tr>
                </thead>
                <tbody>
                  {groupIds.map((groupId) => {
                    const teams = groupTeams[groupId] ?? []
                    const prediction = groupStage.data.groups[groupId] ?? {}
                    const groupStandings = standings.standingsByGroup.get(groupId) ?? []
                    const complete = standings.completeGroups.has(groupId)
                    const actualTopTwo = groupStandings.slice(0, 2).map((entry) => entry.code)

                    const statusLabel = complete
                      ? `${actualTopTwo[0] ?? '—'} / ${actualTopTwo[1] ?? '—'}`
                      : 'In progress'

                    return (
                      <tr key={groupId}>
                        <td>Group {groupId}</td>
                        <td>{formatTeam(prediction.first, teams)}</td>
                        <td>{formatTeam(prediction.second, teams)}</td>
                        <td>{statusLabel}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          </Card>

          <DetailQuickMenu
            stats={[
              { label: 'Groups done', value: `${completion.groupsDone}/${groupIds.length}` },
              { label: 'Best thirds', value: `${completion.bestThirdDone}/${BEST_THIRD_SLOTS}` },
              { label: 'Group lock', value: groupClosed ? 'Closed' : 'Open' },
              { label: 'Mode', value: location.pathname.startsWith('/demo/') ? 'Demo' : 'Default' }
            ]}
            links={[
              { label: 'Back to Play Center', to: toPlayPath() },
              { label: 'Picks Detail', to: toPlayPath('picks') },
              { label: 'Group Stage Detail', to: toPlayPath('group-stage') },
              { label: 'Knockout Detail', to: toPlayPath('bracket') },
              { label: 'League', to: toPlayPath('league') }
            ]}
          />
        </div>
      </PageHeroPanel>

      <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">Best 8 third-place qualifiers (your picks)</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {bestThirds.map((teamCode, index) => (
              <div key={`best-third-${index}`} className="rounded-xl border border-border/70 bg-bg2/40 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Slot {index + 1}</div>
                <div className="text-sm font-semibold text-foreground">{teamCode || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
