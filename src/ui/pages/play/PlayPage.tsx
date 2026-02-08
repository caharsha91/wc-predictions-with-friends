import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../../lib/matches'
import { findPick, isPickComplete } from '../../../lib/picks'
import type { Match } from '../../../types/matches'
import type { Pick } from '../../../types/picks'
import PicksWizardFlow from '../../components/play/PicksWizardFlow'
import DeadlineQueuePanel, { type DeadlineQueueItem } from '../../components/ui/DeadlineQueuePanel'
import PlayCenterHero from '../../components/ui/PlayCenterHero'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import Skeleton from '../../components/ui/Skeleton'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
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

export default function PlayPage() {
  const navigate = useNavigate()
  const userId = useViewerId()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [lastFocusedMatchId, setLastFocusedMatchId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(`wc-play-last-focus:${userId}`)
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

  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!lastFocusedMatchId) return
    window.localStorage.setItem(`wc-play-last-focus:${userId}`, lastFocusedMatchId)
  }, [lastFocusedMatchId, userId])

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
      <Card className="rounded-2xl border-border/60 bg-bg2 p-4 sm:p-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group stage</div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/play/group-stage')}>
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
            <Badge tone={groupClosed ? 'locked' : 'info'}>
              {groupLockTime
                ? `${groupClosed ? 'Closed' : 'Closes'} ${formatDateTime(groupLockTime.toISOString())}`
                : 'No close window'}
            </Badge>
            {groupStage.loadState.status === 'error' ? (
              <Badge tone="danger">Unavailable</Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {groupClosed
              ? 'Group stage is read-only.'
              : 'Pick 1st, 2nd, and best 8 third-place qualifiers.'}
          </div>
        </div>
      </Card>

      <PlayCenterHero
        title="Play Center"
        subtitle="Your move."
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state={playState}
        summary={{
          headline: 'Up next',
          subline:
            pendingOpenMatches.length > 0
              ? 'Tap, pick, profit*'
              : "You're chill.",
          progress: {
            label: 'Progress',
            current: completedOpenMatches.length,
            total: openMatches.length,
            valueSuffix: 'in'
          },
          metrics: [
            { label: 'To pick', value: Math.max(0, metricCounts.todo), tone: 'warning' },
            { label: 'In play', value: metricCounts.inProgress, tone: 'info' },
            { label: 'Closed', value: metricCounts.locked, tone: 'locked' },
            { label: 'Done', value: metricCounts.finished, tone: 'secondary' }
          ],
          statusChip,
          primaryAction: {
            label: 'Continue',
            onClick: handleContinueCurrentMatch,
            disabled: queueMatches.length === 0
          },
          secondaryAction: {
            label: 'Next one',
            onClick: handleNextIncompletePick,
            disabled: !nextIncompleteEntry
          },
          detail: (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigate('/play/picks')}>
                  Schedule
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">Press buttons. Earn glory. ✨</div>
              {inlineNotice ? <div className="text-xs text-muted-foreground">{inlineNotice}</div> : null}

              <div className="grid gap-4 xl:grid-cols-[0.46fr_1.54fr]">
                <Card className="rounded-2xl border-border/60 bg-bg2 p-4 sm:p-5">
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
                      onOpenReferencePage={() => navigate('/play/picks')}
                    />
                  ) : (
                    <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
                      <div className="space-y-3">
                        <div className="text-sm font-semibold text-foreground">You're chill.</div>
                        <div className="text-sm text-muted-foreground">
                          Nothing open right now. Check results or the league.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => navigate('/play/league')}>
                            View league
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => navigate('/play/picks')}>
                            See results
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
