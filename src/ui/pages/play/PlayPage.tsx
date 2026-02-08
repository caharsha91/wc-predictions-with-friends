import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../../lib/matches'
import { findPick, isPickComplete } from '../../../lib/picks'
import type { Match } from '../../../types/matches'
import type { Pick } from '../../../types/picks'
import type { KnockoutStage } from '../../../types/scoring'
import { readDemoScenario } from '../../lib/demoControls'
import { resolveKnockoutActivation } from '../../lib/knockoutActivation'
import { Alert } from '../../components/ui/Alert'
import PicksWizardFlow from '../../components/play/PicksWizardFlow'
import DeadlineQueuePanel, { type DeadlineQueueItem } from '../../components/ui/DeadlineQueuePanel'
import PlayCenterHero from '../../components/ui/PlayCenterHero'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import Skeleton from '../../components/ui/Skeleton'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { useViewerId } from '../../hooks/useViewerId'
import type { PlayCenterState } from '../../lib/nextActionResolver'

const EMPTY_MATCHES: Match[] = []

function formatDateTime(utcIso?: string): string {
  if (!utcIso) return '—'
  return new Date(utcIso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatClosesAt(utcIso?: string): string {
  if (!utcIso) return '—'
  const date = new Date(utcIso)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} • ${time}`
}

function formatLockSubline(utcIso: string): string {
  const time = new Date(utcIso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `Closes ${time}`
}

function formatClosesChip(utcIso: string, now: Date): string {
  const diffMs = new Date(utcIso).getTime() - now.getTime()
  if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
    const totalMinutes = Math.floor(diffMs / (60 * 1000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return `in ${hours}h ${minutes}m`
    return `in ${minutes}m`
  }
  return formatClosesAt(utcIso)
}

function getMatchLabel(match: Match): string {
  return `${match.homeTeam.code} vs ${match.awayTeam.code}`
}

function hasStartedPick(pick?: Pick): boolean {
  return (
    typeof pick?.homeScore === 'number' ||
    typeof pick?.awayScore === 'number' ||
    pick?.advances === 'HOME' ||
    pick?.advances === 'AWAY'
  )
}

function normalizeStatus(status: Match['status'] | string): string {
  return String(status || '').toUpperCase()
}

function isResolvedTeamCode(code?: string): boolean {
  const normalized = (code ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized)
}

type QueueMatch = {
  match: Match
  lockUtc: string
  locked: boolean
  complete: boolean
  started: boolean
  actionLabel: 'Edit' | 'Peek' | 'Open'
}

function toQueueMatch(match: Match, pick: Pick | undefined, now: Date): QueueMatch {
  const lockUtc = getLockTime(match.kickoffUtc).toISOString()
  const locked = isMatchLocked(match.kickoffUtc, now)
  const complete = isPickComplete(match, pick)
  const started = hasStartedPick(pick)

  const actionLabel: QueueMatch['actionLabel'] = locked ? 'Peek' : complete || started ? 'Edit' : 'Open'

  return { match, lockUtc, locked, complete, started, actionLabel }
}

type HubSection = 'group' | 'picks' | 'knockout'
type KnockoutEntry = { stage: KnockoutStage; match: Match }

export default function PlayPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const isDemoRoute = location.pathname.startsWith('/demo/')
  const demoScenario = isDemoRoute ? readDemoScenario() : null
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [lastFocusedMatchId, setLastFocusedMatchId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(`wc-play-last-focus:${mode}:${userId}`)
  })
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [inlineNotice, setInlineNotice] = useState<string | null>(null)

  const emitTelemetry = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('wc-ui-event', {
        detail: { event, ...payload }
      })
    )
  }, [])

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES
  const groupStage = useGroupStageData(matches)
  const knockoutData = useBracketKnockoutData()

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status !== 'FINISHED')
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()),
    [matches]
  )

  const openMatches = useMemo(
    () => upcomingMatches.filter((match) => !isMatchLocked(match.kickoffUtc, now)),
    [now, upcomingMatches]
  )

  const queueMatches = useMemo(
    () =>
      upcomingMatches
        .map((match) => toQueueMatch(match, findPick(picksState.picks, match.id, userId), now))
        .sort((a, b) => new Date(a.lockUtc).getTime() - new Date(b.lockUtc).getTime()),
    [now, picksState.picks, upcomingMatches, userId]
  )

  const pendingOpenMatches = useMemo(
    () => queueMatches.filter((entry) => !entry.locked && !entry.complete).map((entry) => entry.match),
    [queueMatches]
  )

  const completedOpenMatches = useMemo(
    () => queueMatches.filter((entry) => !entry.locked && entry.complete).map((entry) => entry.match),
    [queueMatches]
  )

  const nextIncompleteEntry = useMemo(
    () => queueMatches.find((entry) => !entry.locked && !entry.complete) ?? null,
    [queueMatches]
  )

  const nextLockUtc = queueMatches[0]?.lockUtc
  const latestResultsUpdatedUtc = picksState.state.status === 'ready' ? picksState.state.lastUpdated : undefined
  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = useCallback((segment?: 'picks' | 'group-stage' | 'bracket' | 'league') => {
    if (!segment) return playRoot
    return `${playRoot}/${segment}`
  }, [playRoot])

  const playState: PlayCenterState = useMemo(() => {
    if (picksState.state.status === 'loading') return 'LOADING'
    if (picksState.state.status === 'error') return 'ERROR'
    if (pendingOpenMatches.length > 0) return 'READY_OPEN_PICKS'
    if (completedOpenMatches.length > 0) return 'READY_RESULTS'
    if (upcomingMatches.length > 0) return 'READY_LOCKED_WAITING'
    return 'READY_IDLE'
  }, [completedOpenMatches.length, pendingOpenMatches.length, picksState.state.status, upcomingMatches.length])

  const metricCounts = useMemo(() => {
    let inProgress = 0
    for (const entry of queueMatches) {
      if (entry.locked || entry.complete || !entry.started) continue
      inProgress += 1
    }
    return {
      todo: pendingOpenMatches.length - inProgress,
      inProgress,
      locked: queueMatches.filter((entry) => entry.locked).length,
      finished: matches.filter((match) => match.status === 'FINISHED').length
    }
  }, [matches, pendingOpenMatches.length, queueMatches])

  const statusChip = useMemo(() => {
    if (nextLockUtc) return { type: 'deadline' as const, text: formatClosesChip(nextLockUtc, now) }
    return { type: 'deadline' as const, text: '—' }
  }, [nextLockUtc, now])
  const matchProgressPct = useMemo(
    () => (openMatches.length > 0 ? Math.round((completedOpenMatches.length / openMatches.length) * 100) : 0),
    [completedOpenMatches.length, openMatches.length]
  )

  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const groupMatches = useMemo(() => matches.filter((match) => match.stage === 'Group'), [matches])
  const groupCompleteFromMatches = useMemo(
    () => groupMatches.length > 0 && groupMatches.every((match) => normalizeStatus(match.status) === 'FINISHED'),
    [groupMatches]
  )

  const knockoutMatches = useMemo(() => matches.filter((match) => match.stage !== 'Group'), [matches])
  const roundOf32Matches = useMemo(
    () => knockoutMatches.filter((match) => match.stage === 'R32'),
    [knockoutMatches]
  )
  const knockoutDrawReady = useMemo(
    () =>
      roundOf32Matches.length > 0 &&
      roundOf32Matches.every(
        (match) => isResolvedTeamCode(match.homeTeam.code) && isResolvedTeamCode(match.awayTeam.code)
      ),
    [roundOf32Matches]
  )
  const firstKnockoutKickoffUtc = useMemo(() => {
    const first = knockoutMatches
      .slice()
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())[0]
    return first?.kickoffUtc
  }, [knockoutMatches])
  const knockoutStarted = useMemo(() => {
    const startedByStatus = knockoutMatches.some((match) => normalizeStatus(match.status) !== 'SCHEDULED')
    if (startedByStatus) return true
    if (!firstKnockoutKickoffUtc) return false
    return now.getTime() >= new Date(firstKnockoutKickoffUtc).getTime()
  }, [firstKnockoutKickoffUtc, knockoutMatches, now])
  const groupComplete = groupCompleteFromMatches || groupClosed
  const knockoutActivation = useMemo(
    () =>
      resolveKnockoutActivation({
        mode: isDemoRoute ? 'demo' : 'default',
        demoScenario,
        groupComplete,
        drawReady: knockoutDrawReady,
        knockoutStarted
      }),
    [demoScenario, groupComplete, isDemoRoute, knockoutDrawReady, knockoutStarted]
  )
  const knockoutActive = knockoutActivation.active
  const groupCompletion = useMemo(() => {
    let groupsDone = 0
    for (const groupId of groupStage.groupIds) {
      const selection = groupStage.data.groups[groupId] ?? {}
      if (selection.first && selection.second && selection.first !== selection.second) {
        groupsDone += 1
      }
    }
    const bestThirdDone = groupStage.data.bestThirds.filter(Boolean).length
    return {
      groupsDone,
      groupsTotal: groupStage.groupIds.length,
      bestThirdDone: Math.min(8, bestThirdDone)
    }
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds])

  const groupStageCtaLabel = useMemo(() => {
    if (groupCompletion.groupsTotal === 0) return 'Open Group Stage'
    if (groupClosed) return 'View Group Stage'
    const complete =
      groupCompletion.groupsDone === groupCompletion.groupsTotal && groupCompletion.bestThirdDone === 8
    return complete ? 'Open Group Stage' : 'Continue Group Stage'
  }, [groupClosed, groupCompletion.bestThirdDone, groupCompletion.groupsDone, groupCompletion.groupsTotal])

  const teamsByGroup = useMemo(() => {
    const byGroup = new Map<string, Array<{ code: string; name: string }>>()
    for (const match of groupMatches) {
      if (!match.group) continue
      const existing = byGroup.get(match.group) ?? []
      if (!existing.some((team) => team.code === match.homeTeam.code)) {
        existing.push({ code: match.homeTeam.code, name: match.homeTeam.name })
      }
      if (!existing.some((team) => team.code === match.awayTeam.code)) {
        existing.push({ code: match.awayTeam.code, name: match.awayTeam.name })
      }
      byGroup.set(match.group, existing)
    }
    return byGroup
  }, [groupMatches])

  const activeGroupId = useMemo(() => {
    for (const groupId of groupStage.groupIds) {
      const selection = groupStage.data.groups[groupId] ?? {}
      if (!selection.first || !selection.second || selection.first === selection.second) return groupId
    }
    return groupStage.groupIds[0] ?? null
  }, [groupStage.data.groups, groupStage.groupIds])

  const activeGroupSelection = activeGroupId ? groupStage.data.groups[activeGroupId] ?? {} : {}
  const activeGroupTeams = activeGroupId ? teamsByGroup.get(activeGroupId) ?? [] : []

  const bestThirdActiveIndex = useMemo(() => {
    const firstOpen = groupStage.data.bestThirds.findIndex((team) => !team)
    if (firstOpen >= 0) return firstOpen
    return Math.max(0, groupStage.data.bestThirds.length - 1)
  }, [groupStage.data.bestThirds])

  const bestThirdCandidates = useMemo(() => {
    const excludedTopTwo = new Set<string>()
    for (const groupId of groupStage.groupIds) {
      const pick = groupStage.data.groups[groupId] ?? {}
      if (pick.first) excludedTopTwo.add(pick.first)
      if (pick.second) excludedTopTwo.add(pick.second)
    }
    const selectedElsewhere = new Set(
      groupStage.data.bestThirds
        .map((team, idx) => ({ team, idx }))
        .filter((entry) => entry.idx !== bestThirdActiveIndex && Boolean(entry.team))
        .map((entry) => entry.team)
    )

    const allTeams = [...teamsByGroup.values()].flat()
    return allTeams.filter((team) => !excludedTopTwo.has(team.code) && !selectedElsewhere.has(team.code))
  }, [bestThirdActiveIndex, groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds, teamsByGroup])

  const knockoutEntries = useMemo<KnockoutEntry[]>(() => {
    if (knockoutData.loadState.status !== 'ready') return []
    const readyState = knockoutData.loadState
    return knockoutData.stageOrder.flatMap((stage) =>
      (readyState.byStage[stage] ?? []).map((match) => ({ stage, match }))
    )
  }, [knockoutData.loadState, knockoutData.stageOrder])

  const activeKnockoutEntry = useMemo(() => {
    const firstOpen = knockoutEntries.find(
      (entry) =>
        !isMatchLocked(entry.match.kickoffUtc, now) &&
        !knockoutData.knockout[entry.stage]?.[entry.match.id]
    )
    if (firstOpen) return firstOpen
    return knockoutEntries.find((entry) => !isMatchLocked(entry.match.kickoffUtc, now)) ?? null
  }, [knockoutData.knockout, knockoutEntries, now])

  const activeKnockoutWinner = activeKnockoutEntry
    ? knockoutData.knockout[activeKnockoutEntry.stage]?.[activeKnockoutEntry.match.id]
    : undefined

  const sectionOrder = useMemo<HubSection[]>(() => {
    if (knockoutActive) return ['knockout', 'picks', 'group']
    if (groupClosed) return ['picks', 'knockout', 'group']
    return ['group', 'picks', 'knockout']
  }, [groupClosed, knockoutActive])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!lastFocusedMatchId) return
    window.localStorage.setItem(`wc-play-last-focus:${mode}:${userId}`, lastFocusedMatchId)
  }, [lastFocusedMatchId, mode, userId])

  useEffect(() => {
    if (queueMatches.length === 0) {
      setActiveMatchId(null)
      return
    }
    if (activeMatchId && queueMatches.some((entry) => entry.match.id === activeMatchId && !entry.locked)) return

    const fromStorage =
      lastFocusedMatchId && queueMatches.some((entry) => entry.match.id === lastFocusedMatchId && !entry.locked)
        ? lastFocusedMatchId
        : null

    setActiveMatchId(fromStorage ?? nextIncompleteEntry?.match.id ?? queueMatches.find((entry) => !entry.locked)?.match.id ?? null)
  }, [activeMatchId, lastFocusedMatchId, nextIncompleteEntry?.match.id, queueMatches])

  useEffect(() => {
    emitTelemetry('play_center_viewed', { state: playState })
  }, [emitTelemetry, playState])

  useEffect(() => {
    emitTelemetry('play_center_queue_updated', {
      queue_size: queueMatches.length,
      pending: pendingOpenMatches.length
    })
  }, [emitTelemetry, pendingOpenMatches.length, queueMatches.length])

  const queueItems = useMemo<DeadlineQueueItem[]>(
    () =>
      queueMatches.map((entry) => ({
        id: entry.match.id,
        label: getMatchLabel(entry.match),
        subline: formatLockSubline(entry.lockUtc),
        status: entry.complete ? 'In' : entry.started ? 'In play' : entry.locked ? 'Closed' : 'To pick',
        statusTone: entry.complete ? 'success' : entry.started ? 'info' : entry.locked ? 'locked' : 'warning',
        actionLabel: entry.actionLabel,
        actionDisabled: entry.locked
      })),
    [queueMatches]
  )

  const nextUpcomingMatchdayKey = useMemo(() => {
    const firstUpcoming = queueMatches.find((entry) => !entry.locked)
    if (!firstUpcoming) return null
    return getDateKeyInTimeZone(firstUpcoming.lockUtc)
  }, [queueMatches])

  const queueMatchdayById = useMemo(
    () => new Map(queueMatches.map((entry) => [entry.match.id, getDateKeyInTimeZone(entry.lockUtc)] as const)),
    [queueMatches]
  )

  const nextMatchdayQueueItems = useMemo(
    () =>
      queueItems.filter(
        (item) =>
          nextUpcomingMatchdayKey !== null &&
          queueMatchdayById.get(item.id) === nextUpcomingMatchdayKey
      ),
    [nextUpcomingMatchdayKey, queueItems, queueMatchdayById]
  )

  function focusInlineEditor() {
    const node = editorRef.current
    if (!node) return
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function handleContinueCurrentMatch() {
    const currentQueueEntry =
      activeMatchId ? queueMatches.find((entry) => entry.match.id === activeMatchId && !entry.locked) : null
    if (currentQueueEntry) {
      setInlineNotice(null)
      focusInlineEditor()
      return
    }
    const fallback =
      (lastFocusedMatchId
        ? queueMatches.find((entry) => entry.match.id === lastFocusedMatchId && !entry.locked)?.match.id
        : null) ?? nextIncompleteEntry?.match.id
    if (!fallback) {
      setInlineNotice("You're chill.")
      return
    }
    setInlineNotice(null)
    setActiveMatchId(fallback)
    focusInlineEditor()
  }

  function handleNextIncompletePick() {
    if (!nextIncompleteEntry) {
      setInlineNotice('Nothing open right now. Check results or the league.')
      return
    }
    setInlineNotice(null)
    setActiveMatchId(nextIncompleteEntry.match.id)
    focusInlineEditor()
  }

  function handleSelectQueueItem(matchId: string) {
    setInlineNotice(null)
    setActiveMatchId(matchId)
    setLastFocusedMatchId(matchId)
    emitTelemetry('play_center_queue_item_selected', { match_id: matchId })
  }

  if (playState === 'LOADING') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-bg2 p-4">
          <div className="text-sm font-semibold text-foreground">Syncing…</div>
          <div className="text-sm text-muted-foreground">Finding your next move.</div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (playState === 'ERROR') {
    return (
      <PlayCenterHero
        title="Play Center"
        subtitle="Your move."
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state="ERROR"
        summary={{
          headline: 'Something hiccuped.',
          subline: 'Try again in a sec.',
          metrics: [
            { label: 'To pick', value: 0, tone: 'secondary' },
            { label: 'In play', value: 0, tone: 'secondary' },
            { label: 'Closed', value: 0, tone: 'secondary' },
            { label: 'Done', value: 0, tone: 'secondary' }
          ],
          statusChip: { type: 'lastSubmitted', text: formatDateTime(latestResultsUpdatedUtc) },
          primaryAction: {
            label: 'Retry',
            onClick: () => {
              if (typeof window !== 'undefined') window.location.reload()
            }
          }
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PlayCenterHero
        title="Play Center"
        subtitle="Your move."
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state={playState}
        summary={{
          headline: 'Up next',
          subline: pendingOpenMatches.length > 0 ? 'Use match picks below.' : "You're chill.",
          detail: (
            <div className="space-y-4">
              {sectionOrder.map((section) => {
                if (section === 'group') {
                  if (groupClosed) {
                    return (
                      <Card key="group-collapsed" className="rounded-2xl border-border/60 bg-transparent px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group stage</div>
                            <div className="truncate text-sm text-muted-foreground">Closed. View picks and results.</div>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('group-stage'))}>
                            View
                          </Button>
                        </div>
                      </Card>
                    )
                  }
                  return (
                    <Card key="group-active" className="rounded-2xl border-border/60 bg-transparent p-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group stage</div>
                          <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('group-stage'))}>
                            {groupStageCtaLabel}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={groupCompletion.groupsDone === groupCompletion.groupsTotal ? 'success' : 'warning'}>
                            Groups {groupCompletion.groupsDone}/{groupCompletion.groupsTotal}
                          </Badge>
                          <Badge tone={groupCompletion.bestThirdDone === 8 ? 'success' : 'warning'}>
                            Best thirds {groupCompletion.bestThirdDone}/8
                          </Badge>
                          {groupLockTime ? (
                            <Badge tone={groupClosed ? 'locked' : 'info'}>
                              {groupClosed ? 'Closed' : `Closes ${formatDateTime(groupLockTime.toISOString())}`}
                            </Badge>
                          ) : null}
                        </div>
                        {groupStage.loadState.status === 'loading' ? (
                          <div className="text-xs text-muted-foreground">Loading group wizard…</div>
                        ) : null}
                        {groupStage.loadState.status === 'error' ? (
                          <div className="text-xs text-muted-foreground">Group wizard unavailable. Open detailed page.</div>
                        ) : null}
                        {groupStage.loadState.status === 'ready' && activeGroupId ? (
                          <div className="grid gap-2 rounded-xl border border-border/60 bg-transparent p-3 sm:grid-cols-3">
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span>{`Group ${activeGroupId} • 1st`}</span>
                              <select
                                className="h-9 w-full rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                                value={activeGroupSelection.first ?? ''}
                                onChange={(event) => groupStage.setGroupPick(activeGroupId, 'first', event.target.value)}
                              >
                                <option value="">Select team</option>
                                {activeGroupTeams.map((team) => (
                                  <option key={`${activeGroupId}-first-${team.code}`} value={team.code}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span>{`Group ${activeGroupId} • 2nd`}</span>
                              <select
                                className="h-9 w-full rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                                value={activeGroupSelection.second ?? ''}
                                onChange={(event) => groupStage.setGroupPick(activeGroupId, 'second', event.target.value)}
                              >
                                <option value="">Select team</option>
                                {activeGroupTeams.map((team) => (
                                  <option key={`${activeGroupId}-second-${team.code}`} value={team.code}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1 text-xs text-muted-foreground">
                              <span>{`Best third #${bestThirdActiveIndex + 1}`}</span>
                              <select
                                className="h-9 w-full rounded-lg border border-border/70 bg-bg px-2 text-sm text-foreground"
                                value={groupStage.data.bestThirds[bestThirdActiveIndex] ?? ''}
                                onChange={(event) => groupStage.setBestThird(bestThirdActiveIndex, event.target.value)}
                              >
                                <option value="">Select team</option>
                                {bestThirdCandidates.map((team) => (
                                  <option key={`best-third-${team.code}`} value={team.code}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
                              <Button size="sm" onClick={() => void groupStage.save()} loading={groupStage.saveStatus === 'saving'}>
                                Save group picks
                              </Button>
                              {groupStage.saveStatus === 'saved' ? <Badge tone="success">Saved</Badge> : null}
                              {groupStage.saveStatus === 'error' ? <Badge tone="danger">Save failed</Badge> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  )
                }

                if (section === 'knockout') {
                  if (!knockoutActive) {
                    const collapsedCopy = !groupComplete
                      ? 'Unlocks after group stage closes.'
                      : !knockoutDrawReady
                        ? 'Waiting for draw confirmation.'
                        : 'Inactive. View picks and results.'
                    return (
                      <Card key="knockout-collapsed" className="rounded-2xl border-border/60 bg-transparent px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Knockout</div>
                            <div className="truncate text-sm text-muted-foreground">{collapsedCopy}</div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(toPlayPath('bracket'))}
                            disabled={!groupComplete || !knockoutDrawReady}
                          >
                            View
                          </Button>
                        </div>
                      </Card>
                    )
                  }
                  return (
                    <Card key="knockout-active" className="rounded-2xl border-border/60 bg-transparent p-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Knockout</div>
                          <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('bracket'))}>
                            Continue Knockout
                          </Button>
                        </div>
                        {knockoutActivation.mismatchWarning ? (
                          <Alert tone="warning" title="Knockout activation override">
                            <div>{knockoutActivation.mismatchWarning}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Source of truth: {knockoutActivation.sourceOfTruthLabel}
                            </div>
                          </Alert>
                        ) : null}
                        {knockoutData.loadState.status === 'loading' ? (
                          <div className="text-xs text-muted-foreground">Loading knockout wizard…</div>
                        ) : null}
                        {knockoutData.loadState.status === 'error' ? (
                          <div className="text-xs text-muted-foreground">Knockout wizard unavailable. Open detailed bracket.</div>
                        ) : null}
                        {knockoutData.loadState.status === 'ready' ? (
                          <div className="space-y-2 rounded-xl border border-border/60 bg-transparent p-3">
                            {activeKnockoutEntry ? (
                              <>
                                <div className="text-sm font-semibold text-foreground">
                                  {activeKnockoutEntry.match.homeTeam.code} vs {activeKnockoutEntry.match.awayTeam.code}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Locks {formatDateTime(getLockTime(activeKnockoutEntry.match.kickoffUtc).toISOString())}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={activeKnockoutWinner === 'HOME' ? 'border-primary' : undefined}
                                    onClick={() =>
                                      knockoutData.setPick(activeKnockoutEntry.stage, activeKnockoutEntry.match.id, 'HOME')
                                    }
                                  >
                                    {activeKnockoutEntry.match.homeTeam.code} advances
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={activeKnockoutWinner === 'AWAY' ? 'border-primary' : undefined}
                                    onClick={() =>
                                      knockoutData.setPick(activeKnockoutEntry.stage, activeKnockoutEntry.match.id, 'AWAY')
                                    }
                                  >
                                    {activeKnockoutEntry.match.awayTeam.code} advances
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground">All currently open knockout picks are complete.</div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => void knockoutData.save()}
                                loading={knockoutData.saveStatus === 'saving'}
                              >
                                Save knockout picks
                              </Button>
                              {knockoutData.saveStatus === 'saved' ? <Badge tone="success">Saved</Badge> : null}
                              {knockoutData.saveStatus === 'error' ? <Badge tone="danger">Save failed</Badge> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  )
                }

                return (
                  <Card key="match-picks" className="rounded-2xl border-border/60 bg-transparent p-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Match picks</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">Closes {statusChip.text}</Badge>
                          <Button
                            size="sm"
                            onClick={handleContinueCurrentMatch}
                            disabled={queueMatches.length === 0}
                          >
                            Continue
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleNextIncompletePick}
                            disabled={!nextIncompleteEntry}
                          >
                            Next one
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('picks'))}>
                            Schedule
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress</span>
                          <span>
                            {completedOpenMatches.length}/{openMatches.length} in
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-bg2">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${matchProgressPct}%` }} />
                        </div>
                        <div className="text-xs text-muted-foreground">{matchProgressPct}% complete</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">To pick {Math.max(0, metricCounts.todo)}</Badge>
                          <Badge tone="info">In play {metricCounts.inProgress}</Badge>
                          <Badge tone="locked">Closed {metricCounts.locked}</Badge>
                          <Badge tone="secondary">Done {metricCounts.finished}</Badge>
                        </div>
                      </div>
                      {inlineNotice ? <div className="text-xs text-muted-foreground">{inlineNotice}</div> : null}
                      <div className="grid gap-3 xl:grid-cols-[0.46fr_1.54fr]">
                        <Card className="rounded-2xl border-border/60 bg-transparent p-3 sm:p-4">
                          <DeadlineQueuePanel
                            items={nextMatchdayQueueItems}
                            pageSize={nextMatchdayQueueItems.length || 1}
                            onSelectItem={handleSelectQueueItem}
                            selectedItemId={activeMatchId ?? undefined}
                            heading="Closing soon"
                            description="Tap a match to jump in."
                            emptyMessage="Nothing closing soon. Enjoy the calm."
                            container="inline"
                          />
                        </Card>

                        <div ref={editorRef}>
                          {queueMatches.length > 0 ? (
                            <PicksWizardFlow
                              layout="compact-inline"
                              activeMatchId={activeMatchId}
                              onActiveMatchChange={(matchId) => {
                                if (!matchId) return
                                setActiveMatchId(matchId)
                                setLastFocusedMatchId(matchId)
                              }}
                              onOpenReferencePage={() => navigate(toPlayPath('picks'))}
                            />
                          ) : (
                            <Card className="rounded-2xl border-border/60 p-4">
                              <div className="space-y-3">
                                <div className="text-sm font-semibold text-foreground">You're chill.</div>
                                <div className="text-sm text-muted-foreground">
                                  Nothing open right now. Check results or the league.
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" onClick={() => navigate(toPlayPath('league'))}>
                                    View league
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('picks'))}>
                                    See results
                                  </Button>
                                </div>
                              </div>
                            </Card>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )
        }}
      />
    </div>
  )
}
