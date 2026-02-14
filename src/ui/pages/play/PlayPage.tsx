import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { fetchLeaderboard, fetchMembers, fetchPicks } from '../../../lib/data'
import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, getLockTimePstForDateKey, isMatchLocked } from '../../../lib/matches'
import { findPick, isPickComplete } from '../../../lib/picks'
import type { LeaderboardEntry } from '../../../types/leaderboard'
import type { Match } from '../../../types/matches'
import type { Member } from '../../../types/members'
import type { Pick } from '../../../types/picks'
import { readDemoScenario } from '../../lib/demoControls'
import {
  buildViewerKeySet,
  resolveLeaderboardIdentityKeys,
  resolveLeaderboardUserContext,
  type LeaderboardUserContext
} from '../../lib/leaderboardContext'
import { resolveKnockoutActivation } from '../../lib/knockoutActivation'
import { Alert } from '../../components/ui/Alert'
import PicksWizardFlow from '../../components/play/PicksWizardFlow'
import UserStatusCard from '../../components/play/UserStatusCard'
import DeadlineQueuePanel, { type DeadlineQueueItem } from '../../components/ui/DeadlineQueuePanel'
import PlayCenterHero from '../../components/ui/PlayCenterHero'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import DetailsDisclosure from '../../components/ui/DetailsDisclosure'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/DropdownMenu'
import PanelState from '../../components/ui/PanelState'
import Progress from '../../components/ui/Progress'
import Skeleton from '../../components/ui/Skeleton'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { useToast } from '../../hooks/useToast'
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

function normalizeStatus(status: Match['status'] | string): string {
  return String(status || '').toUpperCase()
}

function isLiveByStatusOrKickoff(match: Match, now: Date): boolean {
  const normalized = normalizeStatus(match.status)
  if (normalized === 'IN_PLAY') return true
  if (normalized === 'FINISHED') return false
  return new Date(match.kickoffUtc).getTime() <= now.getTime()
}

function isInCurrentOrNextPacificDay(utcIso: string, now: Date): boolean {
  const todayPstKey = getDateKeyInTimeZone(now.toISOString())
  const tomorrowPstKey = getDateKeyInTimeZone(getLockTimePstForDateKey(todayPstKey, 1).toISOString())
  const matchPstKey = getDateKeyInTimeZone(utcIso)
  return matchPstKey === todayPstKey || matchPstKey === tomorrowPstKey
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
  live: boolean
  actionLabel: 'Edit' | 'Peek' | 'Open'
}

function toQueueMatch(match: Match, pick: Pick | undefined, now: Date): QueueMatch {
  const lockUtc = getLockTime(match.kickoffUtc).toISOString()
  const locked = isMatchLocked(match.kickoffUtc, now)
  const complete = isPickComplete(match, pick)
  const live = isLiveByStatusOrKickoff(match, now)

  const actionLabel: QueueMatch['actionLabel'] = locked ? 'Peek' : complete || live ? 'Edit' : 'Open'

  return { match, lockUtc, locked, complete, live, actionLabel }
}

type CoreHubSection = 'group' | 'picks' | 'knockout'
type MatchFilter = 'closingSoon' | 'unpicked' | 'live' | 'all'
const MATCH_FILTER_PRIORITY: MatchFilter[] = ['live', 'closingSoon', 'unpicked', 'all']
const MOMENTUM_STORAGE_KEY = 'wc-play-rank-momentum'

type RivalrySummary = {
  you: { rank: number; name: string; points: number }
  above: { name: string; gap: number } | null
  below: { name: string; gap: number } | null
}

type FriendActivity = {
  userId: string
  name: string
  updatedAt: string
  picksCount: number
}

type SocialSignals = {
  userContext: LeaderboardUserContext | null
  rivalry: RivalrySummary | null
  momentumCopy: string
  friendActivity: FriendActivity[]
}

function getQueueMatchesForFilter(filter: MatchFilter, queueMatches: QueueMatch[], now: Date): QueueMatch[] {
  if (filter === 'all') return queueMatches
  if (filter === 'unpicked') return queueMatches.filter((entry) => !entry.locked && !entry.complete)
  if (filter === 'live') return queueMatches.filter((entry) => entry.live)
  return queueMatches
    .filter((entry) => !entry.locked && isInCurrentOrNextPacificDay(entry.match.kickoffUtc, now))
    .sort((a, b) => new Date(a.lockUtc).getTime() - new Date(b.lockUtc).getTime())
}

function formatRelativeTime(utcIso: string, now: Date): string {
  const diffMs = Math.max(0, now.getTime() - new Date(utcIso).getTime())
  const minutes = Math.floor(diffMs / (60 * 1000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function buildMomentumCopy(
  userId: string,
  mode: 'default' | 'demo',
  currentRank: number | null,
  leaderboardUpdatedAt: string | null
): string {
  if (currentRank === null || !leaderboardUpdatedAt) {
    return 'Rank momentum appears after your first scored leaderboard update.'
  }
  if (typeof window === 'undefined') {
    return 'Rank momentum appears after your first scored leaderboard update.'
  }

  const key = `${MOMENTUM_STORAGE_KEY}:${mode}:${userId}`
  let previousRank: number | null = null
  let previousUpdatedAt: string | null = null
  const raw = window.localStorage.getItem(key)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { rank?: unknown; updatedAt?: unknown }
      if (typeof parsed.rank === 'number' && Number.isFinite(parsed.rank)) previousRank = parsed.rank
      if (typeof parsed.updatedAt === 'string') previousUpdatedAt = parsed.updatedAt
    } catch {
      previousRank = null
      previousUpdatedAt = null
    }
  }

  window.localStorage.setItem(
    key,
    JSON.stringify({
      rank: currentRank,
      updatedAt: leaderboardUpdatedAt
    })
  )

  if (previousRank === null || previousUpdatedAt === null || previousUpdatedAt === leaderboardUpdatedAt) {
    return 'Rank momentum appears after your next leaderboard refresh.'
  }

  const delta = previousRank - currentRank
  if (delta > 0) return `You gained +${delta} rank since last update.`
  if (delta < 0) return `You dropped ${Math.abs(delta)} rank since last update.`
  return 'No rank movement since last update.'
}

function buildSocialSignals(
  leaderboardEntries: LeaderboardEntry[],
  leaderboardUpdatedAt: string | null,
  picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[],
  members: Member[],
  userId: string,
  mode: 'default' | 'demo'
): SocialSignals {
  const sortedEntries = [...leaderboardEntries].sort((a, b) => b.totalPoints - a.totalPoints)
  const viewerKey = userId.toLowerCase()
  const userContext = resolveLeaderboardUserContext(
    sortedEntries,
    buildViewerKeySet([userId])
  )
  const youEntry = userContext?.current.entry ?? null
  const aboveEntry = userContext?.above?.entry ?? null
  const belowEntry = userContext?.below?.entry ?? null

  const rivalry: RivalrySummary | null = youEntry
    ? {
        you: {
          rank: userContext?.current.rank ?? 1,
          name: youEntry.member.name,
          points: youEntry.totalPoints
        },
        above: aboveEntry
          ? {
              name: aboveEntry.member.name,
              gap: Math.max(0, aboveEntry.totalPoints - youEntry.totalPoints)
            }
          : null,
        below: belowEntry
          ? {
              name: belowEntry.member.name,
              gap: Math.max(0, youEntry.totalPoints - belowEntry.totalPoints)
            }
          : null
      }
    : null

  const memberNameById = new Map<string, string>()
  for (const member of members) {
    memberNameById.set(member.id.toLowerCase(), member.name)
    if (member.uid) memberNameById.set(member.uid.toLowerCase(), member.name)
    if (member.email) memberNameById.set(member.email.toLowerCase(), member.name)
  }
  for (const entry of sortedEntries) {
    for (const key of resolveLeaderboardIdentityKeys(entry)) {
      memberNameById.set(key, entry.member.name)
    }
  }

  const friendActivity = picksDocs
    .filter((doc) => doc.userId.toLowerCase() !== viewerKey)
    .map((doc) => ({
      userId: doc.userId,
      name: memberNameById.get(doc.userId.toLowerCase()) ?? doc.userId,
      updatedAt: doc.updatedAt,
      picksCount: doc.picks.length
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8)

  return {
    userContext,
    rivalry,
    momentumCopy: buildMomentumCopy(userId, mode, rivalry?.you.rank ?? null, leaderboardUpdatedAt),
    friendActivity
  }
}

export default function PlayPage() {
  // QA-SMOKE: route=/play and /demo/play ; checklist-id=smoke-play-center
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const isDemoRoute = location.pathname.startsWith('/demo/')
  const demoScenario = isDemoRoute ? readDemoScenario() : null
  const now = useNow({ tickMs: 30_000 })
  const { showToast } = useToast()
  const picksState = usePicksData()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [lastFocusedMatchId, setLastFocusedMatchId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(`wc-play-last-focus:${mode}:${userId}`)
  })
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('live')
  const [socialSignals, setSocialSignals] = useState<SocialSignals>({
    userContext: null,
    rivalry: null,
    momentumCopy: 'Rank momentum appears after your next leaderboard refresh.',
    friendActivity: []
  })

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

  useEffect(() => {
    let canceled = false

    async function loadSignals() {
      const [leaderboardResult, picksResult, membersResult] = await Promise.allSettled([
        fetchLeaderboard({ mode }),
        fetchPicks({ mode }),
        fetchMembers({ mode })
      ])
      if (canceled) return

      const leaderboardEntries =
        leaderboardResult.status === 'fulfilled' ? leaderboardResult.value.entries : []
      const leaderboardUpdatedAt =
        leaderboardResult.status === 'fulfilled' ? leaderboardResult.value.lastUpdated : null
      const picksDocs =
        picksResult.status === 'fulfilled' ? picksResult.value.picks : []
      const members =
        membersResult.status === 'fulfilled' ? membersResult.value.members : []

      setSocialSignals(
        buildSocialSignals(
          leaderboardEntries,
          leaderboardUpdatedAt,
          picksDocs,
          members,
          userId,
          mode
        )
      )
    }

    void loadSignals()
    const interval = window.setInterval(() => {
      void loadSignals()
    }, 60_000)
    return () => {
      canceled = true
      window.clearInterval(interval)
    }
  }, [mode, userId])

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
  const knockoutDetailEnabled = isDemoRoute
    ? demoScenario === 'end-group-draw-confirmed' || demoScenario === 'mid-knockout' || demoScenario === 'world-cup-final-pending'
    : groupComplete && knockoutDrawReady
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

  const groupPendingActions = useMemo(() => {
    const groupsRemaining = Math.max(0, groupCompletion.groupsTotal - groupCompletion.groupsDone)
    const bestThirdRemaining = Math.max(0, 8 - groupCompletion.bestThirdDone)
    return groupsRemaining + bestThirdRemaining
  }, [groupCompletion.bestThirdDone, groupCompletion.groupsDone, groupCompletion.groupsTotal])
  const groupProgressPct = useMemo(() => {
    const totalSlots = groupCompletion.groupsTotal + 8
    if (totalSlots <= 0) return 0
    return Math.round(((groupCompletion.groupsDone + groupCompletion.bestThirdDone) / totalSlots) * 100)
  }, [groupCompletion.bestThirdDone, groupCompletion.groupsDone, groupCompletion.groupsTotal])

  const groupStageCtaLabel = useMemo(() => {
    if (groupClosed) return 'View Group Stage'
    return groupPendingActions > 0 ? 'Continue Group Stage' : 'Open Group Stage'
  }, [groupClosed, groupPendingActions])

  const knockoutPendingActions = useMemo(
    () => Math.max(0, knockoutData.totalMatches - knockoutData.completeMatches),
    [knockoutData.completeMatches, knockoutData.totalMatches]
  )

  const knockoutPendingOpenActions = useMemo(() => {
    if (knockoutData.loadState.status !== 'ready') return 0
    let pending = 0
    for (const stage of knockoutData.stageOrder) {
      for (const match of knockoutData.loadState.byStage[stage] ?? []) {
        if (isMatchLocked(match.kickoffUtc, now)) continue
        if (knockoutData.knockout[stage]?.[match.id]) continue
        pending += 1
      }
    }
    return pending
  }, [knockoutData.knockout, knockoutData.loadState, knockoutData.stageOrder, now])
  const knockoutProgressPct = useMemo(() => {
    if (knockoutData.totalMatches <= 0) return 0
    return Math.round((knockoutData.completeMatches / knockoutData.totalMatches) * 100)
  }, [knockoutData.completeMatches, knockoutData.totalMatches])

  const sectionOrder = useMemo<CoreHubSection[]>(() => {
    if (knockoutActive) return ['knockout', 'picks', 'group']
    if (groupClosed) return ['picks', 'knockout', 'group']
    return ['group', 'picks', 'knockout']
  }, [groupClosed, knockoutActive])

  const visibleSections = sectionOrder

  const filterOptions = useMemo(
    () =>
      [
        { id: 'live' as const, label: 'Live' },
        { id: 'closingSoon' as const, label: 'Closing soon' },
        { id: 'unpicked' as const, label: 'Unpicked' },
        { id: 'all' as const, label: 'All' }
      ] satisfies { id: MatchFilter; label: string }[],
    []
  )

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

  const queueMatchesByFilter = useMemo(
    () =>
      ({
        live: getQueueMatchesForFilter('live', queueMatches, now),
        closingSoon: getQueueMatchesForFilter('closingSoon', queueMatches, now),
        unpicked: getQueueMatchesForFilter('unpicked', queueMatches, now),
        all: getQueueMatchesForFilter('all', queueMatches, now)
      }) satisfies Record<MatchFilter, QueueMatch[]>,
    [now, queueMatches]
  )

  const filteredQueueMatches = queueMatchesByFilter[matchFilter]
  const disabledFilters = useMemo(
    () =>
      ({
        live: queueMatchesByFilter.live.length === 0,
        closingSoon: queueMatchesByFilter.closingSoon.length === 0,
        unpicked: queueMatchesByFilter.unpicked.length === 0,
        all: queueMatchesByFilter.all.length === 0
      }) satisfies Record<MatchFilter, boolean>,
    [queueMatchesByFilter]
  )

  useEffect(() => {
    if (queueMatches.length === 0) return
    if (queueMatchesByFilter[matchFilter].length > 0) return
    const startIndex = MATCH_FILTER_PRIORITY.indexOf(matchFilter)
    const nextAvailable = MATCH_FILTER_PRIORITY
      .slice(Math.max(0, startIndex + 1))
      .find((filter) => queueMatchesByFilter[filter].length > 0)
    if (!nextAvailable || nextAvailable === matchFilter) return
    setMatchFilter(nextAvailable)
  }, [matchFilter, queueMatches.length, queueMatchesByFilter])

  const queueItems = useMemo<DeadlineQueueItem[]>(
    () =>
      filteredQueueMatches.map((entry) => ({
        id: entry.match.id,
        label: getMatchLabel(entry.match),
        subline: formatLockSubline(entry.lockUtc),
        status: entry.complete ? 'In' : entry.live ? 'Live' : entry.locked ? 'Closed' : 'To pick',
        statusTone: entry.complete ? 'success' : entry.live ? 'info' : entry.locked ? 'locked' : 'warning',
        actionLabel: entry.actionLabel,
        actionDisabled: entry.locked
      })),
    [filteredQueueMatches]
  )

  const queuePanelHeading = useMemo(() => {
    if (matchFilter === 'unpicked') return 'Unpicked'
    if (matchFilter === 'live') return 'Live now'
    if (matchFilter === 'all') return 'All picks'
    return 'Closing soon'
  }, [matchFilter])

  const queueEmptyMessage = useMemo(() => {
    if (matchFilter === 'unpicked') return 'No unpicked open matches right now.'
    if (matchFilter === 'live') return 'No live matches right now.'
    if (matchFilter === 'all') return 'No matches available right now.'
    return 'Nothing closing soon. Enjoy the calm.'
  }, [matchFilter])

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
      focusInlineEditor()
      return
    }
    const fallback =
      (lastFocusedMatchId
        ? queueMatches.find((entry) => entry.match.id === lastFocusedMatchId && !entry.locked)?.match.id
        : null) ?? nextIncompleteEntry?.match.id
    if (!fallback) {
      showToast({ title: 'No open picks', message: "You're chill.", tone: 'info' })
      return
    }
    setActiveMatchId(fallback)
    focusInlineEditor()
  }

  function handleNextIncompletePick() {
    if (!nextIncompleteEntry) {
      showToast({ title: 'No open picks', message: 'Nothing open right now. Check results or the league.', tone: 'info' })
      return
    }
    setActiveMatchId(nextIncompleteEntry.match.id)
    focusInlineEditor()
  }

  function handleSelectQueueItem(matchId: string) {
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
        subtitle={
          <div className="space-y-1">
            <div>Your move.</div>
            <div className="text-xs text-muted-foreground">{socialSignals.momentumCopy}</div>
          </div>
        }
        lastUpdatedUtc={latestResultsUpdatedUtc}
        state={playState}
        summary={{
          headline: 'Up next',
          subline: pendingOpenMatches.length > 0 ? 'Use match picks below.' : "You're chill.",
          detail: (
            <div className="space-y-4">
              <UserStatusCard
                context={socialSignals.userContext}
                onOpenLeague={() => navigate(toPlayPath('league'))}
              />

              <Card className="rounded-2xl border-border/60 bg-bg2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rivalry</div>
                  {socialSignals.rivalry ? (
                    <Badge tone="info">Rank #{socialSignals.rivalry.you.rank}</Badge>
                  ) : (
                    <Badge tone="secondary">No rank yet</Badge>
                  )}
                </div>
                {socialSignals.rivalry ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-transparent p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">You</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{socialSignals.rivalry.you.name}</div>
                      <div className="text-xs text-muted-foreground">{socialSignals.rivalry.you.points} pts</div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-transparent p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Above</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {socialSignals.rivalry.above?.name ?? 'Leader locked in'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {socialSignals.rivalry.above
                          ? `${socialSignals.rivalry.above.gap} pts to catch`
                          : 'You are at the top'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-transparent p-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Below</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {socialSignals.rivalry.below?.name ?? 'No one below yet'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {socialSignals.rivalry.below
                          ? `${socialSignals.rivalry.below.gap} pts cushion`
                          : 'Keep pushing'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <PanelState
                    className="mt-2 text-xs"
                    message="Complete picks and wait for scoring to join the rivalry strip."
                    tone="empty"
                  />
                )}
              </Card>

              <DetailsDisclosure
                title="Friend activity"
                defaultOpen={false}
                meta={
                  socialSignals.friendActivity.length > 0
                    ? `${socialSignals.friendActivity.length} recent`
                    : 'No recent updates'
                }
                className="bg-bg2"
              >
                {socialSignals.friendActivity.length === 0 ? (
                  <PanelState message="No friend updates yet." tone="empty" />
                ) : (
                  <div className="space-y-2">
                    {socialSignals.friendActivity.map((activity) => (
                      <div
                        key={activity.userId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-transparent p-2"
                      >
                        <div className="text-sm font-semibold text-foreground">{activity.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Updated {activity.picksCount} picks · {formatRelativeTime(activity.updatedAt, now)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailsDisclosure>

              <Card className="sticky top-2 z-10 rounded-2xl border-border/60 bg-bg2/95 p-3 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">
                    {pendingOpenMatches.length > 0
                      ? `Nearest lock ${statusChip.text} • ${pendingOpenMatches.length} pending`
                      : "You're chill. No open picks."}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {nextLockUtc ? `Locks at ${formatDateTime(nextLockUtc)}` : 'No upcoming lock'}
                  </div>
                </div>
              </Card>

              {visibleSections.map((section) => {
                if (section === 'group') {
                  return (
                    <Card key="group-summary" className="rounded-2xl border-border/60 bg-transparent p-4">
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
                          <Badge tone={groupPendingActions === 0 ? 'success' : 'warning'}>
                            Pending {groupPendingActions}
                          </Badge>
                          {groupLockTime ? (
                            <Badge tone={groupClosed ? 'locked' : 'info'}>
                              {groupClosed ? 'Closed' : `Closes ${formatDateTime(groupLockTime.toISOString())}`}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Group picks completed</span>
                            <span>
                              {groupCompletion.groupsDone + groupCompletion.bestThirdDone}/
                              {groupCompletion.groupsTotal + 8}
                            </span>
                          </div>
                          <Progress
                            value={groupProgressPct}
                            intent={groupPendingActions > 0 ? 'warning' : 'success'}
                            size="sm"
                            aria-label="Group stage progress"
                          />
                        </div>
                        {groupStage.loadState.status === 'loading' ? (
                          <PanelState className="text-xs" message="Loading group-stage progress…" tone="loading" />
                        ) : null}
                        {groupStage.loadState.status === 'error' ? (
                          <PanelState
                            className="text-xs"
                            message="Group progress unavailable. Open detailed page."
                            tone="error"
                          />
                        ) : null}
                        <div className="text-xs text-muted-foreground">Open group-stage details to edit or review picks.</div>
                      </div>
                    </Card>
                  )
                }

                if (section === 'knockout') {
                  return (
                    <Card key="knockout-summary" className="rounded-2xl border-border/60 bg-transparent p-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Knockout</div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(toPlayPath('bracket'))}
                            disabled={!knockoutDetailEnabled}
                          >
                            Open Knockout
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={knockoutPendingActions === 0 ? 'success' : 'warning'}>
                            Pending {knockoutPendingActions}
                          </Badge>
                          <Badge tone={knockoutPendingOpenActions === 0 ? 'secondary' : 'warning'}>
                            Pending now {knockoutPendingOpenActions}
                          </Badge>
                          <Badge tone={knockoutActive ? 'info' : 'secondary'}>
                            {knockoutActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Knockout picks completed</span>
                            <span>
                              {knockoutData.completeMatches}/{knockoutData.totalMatches}
                            </span>
                          </div>
                          <Progress
                            value={knockoutProgressPct}
                            intent={knockoutPendingActions > 0 ? 'default' : 'success'}
                            size="sm"
                            aria-label="Knockout progress"
                          />
                        </div>
                        {!knockoutDetailEnabled ? (
                          <div className="text-xs text-muted-foreground">
                            {!groupComplete
                              ? 'Unlocks after group stage completes.'
                              : !knockoutDrawReady && !isDemoRoute
                                ? 'Waiting for draw confirmation.'
                                : 'Not available for this scenario yet.'}
                          </div>
                        ) : null}
                        {knockoutActivation.mismatchWarning ? (
                          <Alert tone="warning" title="Knockout activation override">
                            <div>{knockoutActivation.mismatchWarning}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Source of truth: {knockoutActivation.sourceOfTruthLabel}
                            </div>
                          </Alert>
                        ) : null}
                        <div className="text-xs text-muted-foreground">Open knockout details to edit or review bracket picks.</div>
                      </div>
                    </Card>
                  )
                }

                return (
                  <Card key="match-picks" className="rounded-2xl border-border/60 bg-transparent p-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Match picks</div>
                          <div className="text-xs text-muted-foreground">Upcoming matches and prediction entry in one flow.</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warning">Closes {statusChip.text}</Badge>
                          <Badge tone={pendingOpenMatches.length > 0 ? 'warning' : 'success'}>
                            {pendingOpenMatches.length > 0 ? `Pending ${pendingOpenMatches.length}` : 'All set'}
                          </Badge>
                          <Button
                            size="sm"
                            onClick={handleNextIncompletePick}
                            disabled={!nextIncompleteEntry}
                          >
                            Continue picking
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="secondary" aria-label="Open more match actions">
                                More
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={handleContinueCurrentMatch}>
                                Resume current match
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => navigate(toPlayPath('picks'))}>
                                Open all picks
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => navigate(toPlayPath('league'))}>
                                Open league board
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Match picks completed</span>
                        <span>
                          {completedOpenMatches.length}/{openMatches.length}
                        </span>
                      </div>
                      <Progress
                        value={matchProgressPct}
                        intent={pendingOpenMatches.length > 0 ? 'momentum' : 'success'}
                        size="sm"
                        aria-label="Match picks progress"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        {filterOptions.map((filter) => {
                          const isDisabled = disabledFilters[filter.id]
                          return (
                          <Button
                            key={filter.id}
                            size="sm"
                            variant={matchFilter === filter.id ? 'primary' : 'secondary'}
                            aria-label={`Filter matches by ${filter.label}`}
                            onClick={() => {
                              if (isDisabled) return
                              setMatchFilter(filter.id)
                            }}
                            disabled={isDisabled}
                          >
                            {filter.label}
                          </Button>
                          )
                        })}
                      </div>
                      <div className="grid gap-3 xl:grid-cols-[0.46fr_1.54fr]">
                        <Card className="rounded-2xl border-border/60 bg-transparent p-3 sm:p-4">
                          <DeadlineQueuePanel
                            items={queueItems}
                            pageSize={3}
                            onSelectItem={handleSelectQueueItem}
                            selectedItemId={activeMatchId ?? undefined}
                            heading={queuePanelHeading}
                            description="Tap a match to jump in."
                            emptyMessage={queueEmptyMessage}
                            paginationKey={matchFilter}
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
                                <PanelState
                                  className="text-sm"
                                  message="Nothing open right now. Check results or the league."
                                  tone="empty"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" onClick={() => navigate(toPlayPath('league'))}>
                                    Open league board
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => navigate(toPlayPath('picks'))}>
                                    Open all picks
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
