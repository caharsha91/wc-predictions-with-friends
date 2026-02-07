import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getLockTime, isMatchLocked } from '../../../lib/matches'
import { findPick, isPickComplete } from '../../../lib/picks'
import type { Match } from '../../../types/matches'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import DeadlineQueuePanel, { type DeadlineQueueItem } from '../../components/ui/DeadlineQueuePanel'
import DetailsDisclosure from '../../components/ui/DetailsDisclosure'
import PlayCenterHero from '../../components/ui/PlayCenterHero'
import Skeleton from '../../components/ui/Skeleton'
import { CORE_LIST_PAGE_SIZE } from '../../constants/pagination'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useViewerId } from '../../hooks/useViewerId'
import {
  getPlayCenterStateFromAction,
  resolveNextAction,
  type NextActionKind
} from '../../lib/nextActionResolver'

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

function toMillis(utcIso?: string): number {
  if (!utcIso) return Number.POSITIVE_INFINITY
  const value = new Date(utcIso).getTime()
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
}

function formatMatchLabel(match: Match) {
  return `${match.homeTeam.code} vs ${match.awayTeam.code}`
}

export default function PlayPage() {
  const navigate = useNavigate()
  const userId = useViewerId()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const bracketData = useBracketKnockoutData()
  const [seenResultsUpdatedUtc, setSeenResultsUpdatedUtc] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    return window.sessionStorage.getItem(`wc-results-seen:${userId}`) ?? undefined
  })

  const emitTelemetry = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('wc-ui-event', {
        detail: { event, ...payload }
      })
    )
  }, [])

  useEffect(() => {
    const storageKey = `wc-results-seen:${userId}`
    if (typeof window === 'undefined') return

    function syncSeenResults() {
      setSeenResultsUpdatedUtc(window.sessionStorage.getItem(storageKey) ?? undefined)
    }

    syncSeenResults()
    window.addEventListener('wc-results-seen-updated', syncSeenResults as EventListener)
    window.addEventListener('storage', syncSeenResults)
    return () => {
      window.removeEventListener('wc-results-seen-updated', syncSeenResults as EventListener)
      window.removeEventListener('storage', syncSeenResults)
    }
  }, [userId])

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES

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

  const pendingOpenMatches = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return !isPickComplete(match, pick)
      }),
    [openMatches, picksState.picks, userId]
  )

  const completedOpenMatches = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return isPickComplete(match, pick)
      }),
    [openMatches, picksState.picks, userId]
  )

  const lockedMatches = useMemo(
    () => upcomingMatches.filter((match) => isMatchLocked(match.kickoffUtc, now)),
    [now, upcomingMatches]
  )

  const pastMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === 'FINISHED' || new Date(match.kickoffUtc).getTime() < now.getTime())
        .sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime()),
    [matches, now]
  )

  const openBracketCandidates = useMemo(() => {
    if (bracketData.loadState.status !== 'ready') return []

    const stageOrder = new Map(bracketData.stageOrder.map((stage, index) => [stage, index]))
    const candidates: Array<{
      id: string
      label: string
      deadlineUtc: string
      kickoffUtc: string
      stageOrder: number
    }> = []

    for (const stage of bracketData.stageOrder) {
      const stageMatches = bracketData.loadState.byStage[stage] ?? []
      const stagePicks = bracketData.knockout[stage] ?? {}
      for (const match of stageMatches) {
        if (isMatchLocked(match.kickoffUtc, now)) continue
        if (stagePicks[match.id]) continue
        candidates.push({
          id: match.id,
          label: `${stage} · ${match.homeTeam.code} vs ${match.awayTeam.code}`,
          deadlineUtc: getLockTime(match.kickoffUtc).toISOString(),
          kickoffUtc: match.kickoffUtc,
          stageOrder: stageOrder.get(stage) ?? Number.POSITIVE_INFINITY
        })
      }
    }

    return candidates
  }, [bracketData.knockout, bracketData.loadState, bracketData.stageOrder, now])

  const lastSubmittedUtc = useMemo(() => {
    let latest = ''
    for (const pick of picksState.picks) {
      if (!pick.updatedAt) continue
      if (!latest || new Date(pick.updatedAt).getTime() > new Date(latest).getTime()) {
        latest = pick.updatedAt
      }
    }
    return latest || undefined
  }, [picksState.picks])

  const nextLockedKickoffUtc = useMemo(() => {
    const sorted = [...lockedMatches].sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    )
    return sorted[0]?.kickoffUtc
  }, [lockedMatches])

  const latestResultsUpdatedUtc = picksState.state.status === 'ready' ? picksState.state.lastUpdated : undefined

  const nextAction = useMemo(
    () =>
      resolveNextAction({
        openPickCandidates: pendingOpenMatches.map((match) => ({
          id: match.id,
          label: formatMatchLabel(match),
          deadlineUtc: getLockTime(match.kickoffUtc).toISOString(),
          kickoffUtc: match.kickoffUtc,
          stageOrder: 0
        })),
        openBracketCandidates,
        latestResultsUpdatedUtc,
        seenResultsUpdatedUtc,
        lockedWaitingDeadlineUtc: nextLockedKickoffUtc,
        lastSubmittedUtc
      }),
    [
      lastSubmittedUtc,
      latestResultsUpdatedUtc,
      nextLockedKickoffUtc,
      openBracketCandidates,
      pendingOpenMatches,
      seenResultsUpdatedUtc
    ]
  )

  const playState = useMemo(() => {
    if (picksState.state.status === 'loading' || bracketData.loadState.status === 'loading') return 'LOADING'
    if (picksState.state.status === 'error' || bracketData.loadState.status === 'error') return 'ERROR'
    return getPlayCenterStateFromAction(nextAction.kind)
  }, [bracketData.loadState.status, nextAction.kind, picksState.state.status])

  useEffect(() => {
    emitTelemetry('play_center_viewed', { state: playState })
  }, [emitTelemetry, playState])

  useEffect(() => {
    emitTelemetry('play_center_state_changed', { state: playState, action: nextAction.kind })
  }, [emitTelemetry, nextAction.kind, playState])

  const deadlineQueue = useMemo(() => {
    const pickItems = pendingOpenMatches.map((match) => ({
      id: `pick:${match.id}`,
      label: formatMatchLabel(match),
      subline: `Picks lock ${formatDateTime(getLockTime(match.kickoffUtc).toISOString())}`,
      status: 'Needs pick',
      deadlineUtc: getLockTime(match.kickoffUtc).toISOString(),
      kickoffUtc: match.kickoffUtc,
      stageOrder: 0
    }))

    const bracketItems = openBracketCandidates.map((candidate) => ({
      id: `bracket:${candidate.id}`,
      label: candidate.label,
      subline: `Bracket lock ${formatDateTime(candidate.deadlineUtc)}`,
      status: 'Bracket open',
      deadlineUtc: candidate.deadlineUtc,
      kickoffUtc: candidate.kickoffUtc,
      stageOrder: candidate.stageOrder
    }))

    return [...pickItems, ...bracketItems]
      .sort((a, b) => {
        const deadlineDiff = toMillis(a.deadlineUtc) - toMillis(b.deadlineUtc)
        if (deadlineDiff !== 0) return deadlineDiff

        const kickoffDiff = toMillis(a.kickoffUtc) - toMillis(b.kickoffUtc)
        if (kickoffDiff !== 0) return kickoffDiff

        const stageDiff = a.stageOrder - b.stageOrder
        if (stageDiff !== 0) return stageDiff

        return a.id.localeCompare(b.id)
      })
      .map<DeadlineQueueItem>((item) => ({
        id: item.id,
        label: item.label,
        subline: item.subline,
        status: item.status
      }))
  }, [openBracketCandidates, pendingOpenMatches])

  function routeForAction(action: NextActionKind) {
    if (action === 'OPEN_PICKS') return '/play/picks/wizard'
    if (action === 'OPEN_BRACKET') return '/play/bracket'
    if (action === 'VIEW_RESULTS') return '/play/results'
    if (action === 'LOCKED_WAITING') return '/play/picks'
    return '/play/league'
  }

  function primaryLabel(action: NextActionKind) {
    if (action === 'OPEN_PICKS') return 'Continue next action'
    if (action === 'OPEN_BRACKET') return 'Resume bracket action'
    if (action === 'VIEW_RESULTS') return 'Review latest results'
    if (action === 'LOCKED_WAITING') return 'View lock queue'
    return 'Open league'
  }

  function onPrimaryAction() {
    const path = routeForAction(nextAction.kind)
    emitTelemetry('play_center_primary_cta_clicked', { action: nextAction.kind, path })
    navigate(path)
  }

  function onOpenQueueItem(itemId: string) {
    if (itemId.startsWith('bracket:')) {
      navigate('/play/bracket')
      return
    }
    navigate('/play/picks')
  }

  function renderCompactList(matchesToRender: Match[]) {
    const visible = matchesToRender.slice(0, CORE_LIST_PAGE_SIZE)
    if (visible.length === 0) {
      return <div className="text-sm text-muted-foreground">No matches in this section.</div>
    }
    return (
      <div className="space-y-2">
        {visible.map((match) => (
          <div
            key={match.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-bg2 p-3"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">{formatMatchLabel(match)}</div>
              <div className="text-xs text-muted-foreground">
                {match.stage} · {formatDateTime(match.kickoffUtc)}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigate('/play/picks')}>
              Open picks
            </Button>
          </div>
        ))}
      </div>
    )
  }

  if (playState === 'LOADING') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    )
  }

  if (playState === 'ERROR') {
    return (
      <PlayCenterHero
        title="Play Center"
        subtitle="Plan, pick, advance, review, and compete from one queue."
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state="ERROR"
        summary={{
          headline: 'Unable to load play state',
          subline: 'Refresh to retry loading picks and bracket actions.',
          metrics: [
            { label: 'Open picks', value: 0, tone: 'secondary' },
            { label: 'Open bracket', value: 0, tone: 'secondary' }
          ],
          statusChip: { type: 'lastSubmitted', text: 'Unavailable' },
          primaryAction: {
            label: 'Open picks',
            onClick: () => navigate('/play/picks')
          },
          secondaryAction: {
            label: 'Open exports',
            onClick: () => navigate('/admin/exports')
          }
        }}
      />
    )
  }

  const nextOpenDeadlineUtc = pendingOpenMatches
    .map((match) => getLockTime(match.kickoffUtc).toISOString())
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]

  return (
    <div className="space-y-4">
      <PlayCenterHero
        title="Play Center"
        subtitle="Game loop: plan → pick → advance → review → compete → export."
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state={playState}
        summary={{
          headline: nextAction.label,
          subline: nextAction.reason,
          progress: {
            label: 'Open picks progress',
            current: completedOpenMatches.length,
            total: openMatches.length
          },
          metrics: [
            { label: 'Needs action', value: pendingOpenMatches.length, tone: 'warning' },
            { label: 'Bracket open', value: openBracketCandidates.length, tone: 'info' },
            { label: 'Locked', value: lockedMatches.length, tone: 'locked' },
            { label: 'Past', value: pastMatches.length, tone: 'secondary' }
          ],
          statusChip: {
            type: nextAction.statusChip.type,
            text: formatDateTime(nextAction.statusChip.atUtc)
          },
          primaryAction: {
            label: primaryLabel(nextAction.kind),
            onClick: onPrimaryAction
          },
          secondaryAction: {
            label: 'Open picks queue',
            onClick: () => navigate('/play/picks')
          }
        }}
        sidePanel={
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Next lock window</div>
            <div className="text-2xl font-semibold text-foreground">{formatDateTime(nextOpenDeadlineUtc)}</div>
            <div className="text-sm text-muted-foreground">
              {pendingOpenMatches.length > 0
                ? `${pendingOpenMatches.length} open picks are still pending submission.`
                : 'No open picks pending right now.'}
            </div>
          </div>
        }
      />

      <DeadlineQueuePanel items={deadlineQueue} pageSize={3} onOpenItem={onOpenQueueItem} />

      <DetailsDisclosure
        title={`Open (${pendingOpenMatches.length})`}
        defaultOpen
        meta={<Badge tone="warning">Deadline {formatDateTime(nextOpenDeadlineUtc)}</Badge>}
      >
        {renderCompactList(pendingOpenMatches)}
      </DetailsDisclosure>

      <DetailsDisclosure
        title={`Completed (${completedOpenMatches.length})`}
        meta={<Badge tone="success">Last submitted {formatDateTime(lastSubmittedUtc)}</Badge>}
      >
        {renderCompactList(completedOpenMatches)}
      </DetailsDisclosure>

      <DetailsDisclosure
        title={`Locked / Waiting (${lockedMatches.length})`}
        meta={<Badge tone="locked">Unlock {formatDateTime(nextLockedKickoffUtc)}</Badge>}
      >
        {renderCompactList(lockedMatches)}
      </DetailsDisclosure>

      <DetailsDisclosure
        title={`Past (${pastMatches.length})`}
        meta={<Badge tone="secondary">Updated {formatDateTime(latestResultsUpdatedUtc)}</Badge>}
      >
        {renderCompactList(pastMatches)}
      </DetailsDisclosure>
    </div>
  )
}
