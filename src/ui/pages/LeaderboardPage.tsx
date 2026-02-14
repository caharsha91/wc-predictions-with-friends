import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva } from 'class-variance-authority'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchLeaderboard, fetchMatches, fetchPicks, fetchScoring } from '../../lib/data'
import { isMatchLocked, getLockTime } from '../../lib/matches'
import { getPredictedWinner } from '../../lib/picks'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { ScoringConfig } from '../../types/scoring'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import DetailsDisclosure from '../components/ui/DetailsDisclosure'
import PanelState from '../components/ui/PanelState'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import ScoreStepper from '../components/ui/ScoreStepper'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import { LEADERBOARD_LIST_PAGE_SIZE } from '../constants/pagination'
import { useAuthState } from '../hooks/useAuthState'
import { useNow } from '../hooks/useNow'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys, resolveLeaderboardUserContext } from '../lib/leaderboardContext'
import { buildSocialBadgeMap, type SocialBadge } from '../lib/socialBadges'
import { cn } from '../lib/utils'
import { buildProjectedLeaderboard, type SimulatedMatchOutcome } from '../lib/whatIfSimulator'

const RANK_SNAPSHOT_STORAGE_KEY = 'wc-leaderboard-rank-snapshot'

const leaderboardRow = cva(
  'grid grid-cols-[88px_96px_minmax(220px,1fr)_96px_96px_96px_96px_96px] items-center gap-2 rounded-2xl border px-3 py-3 transition duration-200 hover:scale-[1.01] hover:shadow-[0_0_0_1px_var(--border-accent),0_0_20px_var(--glow)]',
  {
    variants: {
      intent: {
        default: 'border-border/70 bg-card',
        user:
          'border-[var(--border-accent)] bg-[var(--accent-soft)]/65 ring-2 ring-[var(--border-accent)] shadow-[0_0_0_1px_var(--border-accent),0_0_28px_var(--glow)]',
        rival: 'border-[var(--border-warning)] bg-[var(--banner-accent)]/35 shadow-[inset_0_0_0_1px_var(--border-warning)]'
      }
    },
    defaultVariants: {
      intent: 'default'
    }
  }
)

const momentumChevron = cva('inline-flex items-center justify-center text-lg font-black leading-none', {
  variants: {
    direction: {
      up: 'text-success',
      down: 'text-destructive',
      flat: 'text-muted-foreground'
    }
  },
  defaultVariants: {
    direction: 'flat'
  }
})

const podiumSurface = cva('rounded-3xl border backdrop-blur-md shadow-[var(--shadow1)]', {
  variants: {
    tone: {
      podium:
        'border-border/70 bg-[linear-gradient(145deg,var(--accent-soft),transparent_58%),linear-gradient(320deg,var(--accent-violet-soft),transparent_62%)]',
      rival:
        'border-border/70 bg-[linear-gradient(145deg,var(--banner-accent),transparent_58%),linear-gradient(320deg,var(--accent-soft),transparent_62%)]'
    }
  },
  defaultVariants: {
    tone: 'podium'
  }
})

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      entries: LeaderboardEntry[]
      lastUpdated: string
      matches: Match[]
      picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[]
      scoring: ScoringConfig
    }

type RankSnapshot = {
  lastUpdated: string
  ranks: Record<string, number>
}

type SwingOpportunity = {
  matchId: string
  label: string
  lockUtc: string
  kickoffUtc: string
  votes: number
  consensusTeam: string | null
  consensusPct: number | null
  swingScore: number
}

type MovementDirection = 'up' | 'down' | 'flat'

type WhatIfDraft = {
  enabled: boolean
  homeScore: number
  awayScore: number
  advances?: 'HOME' | 'AWAY'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getEntryIdentityKey(entry: LeaderboardEntry): string {
  const id = entry.member.id?.trim().toLowerCase()
  if (id) return `id:${id}`
  const uid = entry.member.uid?.trim().toLowerCase()
  if (uid) return `uid:${uid}`
  const email = entry.member.email?.trim().toLowerCase()
  if (email) return `email:${email}`
  return `name:${entry.member.name.trim().toLowerCase()}`
}

function buildRankSnapshot(entries: LeaderboardEntry[]): Record<string, number> {
  const snapshot: Record<string, number> = {}
  for (let index = 0; index < entries.length; index += 1) {
    snapshot[getEntryIdentityKey(entries[index])] = index + 1
  }
  return snapshot
}

function readRankSnapshot(mode: 'default' | 'demo'): RankSnapshot | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(`${RANK_SNAPSHOT_STORAGE_KEY}:${mode}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { lastUpdated?: unknown; ranks?: unknown }
    if (
      typeof parsed.lastUpdated !== 'string' ||
      !parsed.ranks ||
      typeof parsed.ranks !== 'object' ||
      Array.isArray(parsed.ranks)
    ) {
      return null
    }
    const ranks = Object.fromEntries(
      Object.entries(parsed.ranks).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    ) as Record<string, number>
    return { lastUpdated: parsed.lastUpdated, ranks }
  } catch {
    return null
  }
}

function writeRankSnapshot(mode: 'default' | 'demo', snapshot: RankSnapshot): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${RANK_SNAPSHOT_STORAGE_KEY}:${mode}`, JSON.stringify(snapshot))
}

function getMatchLabel(match: Match): string {
  return `${match.homeTeam.code} vs ${match.awayTeam.code}`
}

function buildSwingOpportunities(
  matches: Match[],
  picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[],
  now: Date
): SwingOpportunity[] {
  const openMatches = matches
    .filter((match) => match.status !== 'FINISHED')
    .filter((match) => !isMatchLocked(match.kickoffUtc, now))
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())

  const picksByMatch = new Map<string, { home: number; away: number; total: number }>()
  for (const doc of picksDocs) {
    for (const pick of doc.picks) {
      const winner = getPredictedWinner(pick)
      if (winner !== 'HOME' && winner !== 'AWAY') continue
      const current = picksByMatch.get(pick.matchId) ?? { home: 0, away: 0, total: 0 }
      if (winner === 'HOME') current.home += 1
      if (winner === 'AWAY') current.away += 1
      current.total += 1
      picksByMatch.set(pick.matchId, current)
    }
  }

  const opportunities: SwingOpportunity[] = openMatches.map((match) => {
    const picks = picksByMatch.get(match.id) ?? { home: 0, away: 0, total: 0 }
    const topVotes = Math.max(picks.home, picks.away)
    const runnerUpVotes = Math.min(picks.home, picks.away)
    const margin = picks.total > 0 ? (topVotes - runnerUpVotes) / picks.total : 1
    const disagreement = Math.max(0, 1 - margin)
    const sampleWeight = picks.total > 0 ? picks.total / (picks.total + 4) : 0
    const swingScore = Number((disagreement * sampleWeight).toFixed(4))
    const consensusWinner = picks.home >= picks.away ? 'HOME' : 'AWAY'
    const consensusTeam =
      picks.total > 0
        ? consensusWinner === 'HOME'
          ? match.homeTeam.code
          : match.awayTeam.code
        : null
    const consensusPct = picks.total > 0 ? Math.round((topVotes / picks.total) * 100) : null
    return {
      matchId: match.id,
      label: getMatchLabel(match),
      lockUtc: getLockTime(match.kickoffUtc).toISOString(),
      kickoffUtc: match.kickoffUtc,
      votes: picks.total,
      consensusTeam,
      consensusPct,
      swingScore
    }
  })

  return opportunities.sort((a, b) => {
    if (b.swingScore !== a.swingScore) return b.swingScore - a.swingScore
    return new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
  })
}

function getMovementDirection(delta: number): MovementDirection {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

function SocialBadgePill({ badge }: { badge: SocialBadge }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-bg2/60 px-2.5 py-1 text-xs text-foreground">
      <span
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center',
          badge.kind === 'perfect_pick'
            ? 'text-[var(--success)]'
            : badge.kind === 'contrarian'
              ? 'text-[var(--warning)]'
              : 'text-[var(--info)]'
        )}
        aria-hidden="true"
      >
        {badge.kind === 'perfect_pick' ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M10 1.5l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L3 6.6l4.8-.7L10 1.5z" />
          </svg>
        ) : badge.kind === 'contrarian' ? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M10 1.5l8.5 15H1.5l8.5-15zm0 4.2L6 13h8l-4-7.3z" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M10 2.5a6 6 0 00-6 6c0 4 6 9 6 9s6-5 6-9a6 6 0 00-6-6zm0 8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        )}
      </span>
      <span className="font-semibold">{badge.label}</span>
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-card p-5">
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <div className="rounded-3xl border border-border/60 bg-bg2/40 p-5">
            <div className="h-4 w-32 animate-pulse rounded bg-bg2" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="rounded-2xl border border-border/60 bg-card p-4">
                  <div className="h-3 w-14 animate-pulse rounded bg-bg2" />
                  <div className="mt-2 h-6 w-16 animate-pulse rounded bg-bg2" />
                  <div className="mt-2 h-3 w-full animate-pulse rounded bg-bg2" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-bg2/40 p-5">
            <div className="h-4 w-28 animate-pulse rounded bg-bg2" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-bg2" />
            <div className="mt-3 h-3 w-5/6 animate-pulse rounded bg-bg2" />
            <div className="mt-5 h-3 w-full animate-pulse rounded bg-bg2" />
            <div className="mt-3 h-9 w-28 animate-pulse rounded-full bg-bg2" />
          </div>
        </div>
      </div>
      <Card className="rounded-2xl border-border/60 p-4">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl border border-border/60 bg-bg2/30" />
          ))}
        </div>
      </Card>
    </div>
  )
}

export default function LeaderboardPage() {
  // QA-SMOKE: route=/play/league and /demo/play/league ; checklist-id=smoke-leaderboard
  const navigate = useNavigate()
  const userId = useViewerId()
  const authState = useAuthState()
  const mode = useRouteDataMode()
  const now = useNow()
  const [page, setPage] = useState(1)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [previousRanks, setPreviousRanks] = useState<Record<string, number> | null>(null)
  const [isCurrentRowVisible, setIsCurrentRowVisible] = useState(true)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [whatIfDrafts, setWhatIfDrafts] = useState<Record<string, WhatIfDraft>>({})
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const currentRowRef = useRef<HTMLDivElement | null>(null)

  const viewerKeys = useMemo(() => {
    return buildViewerKeySet([userId, authState.user?.uid, authState.user?.email])
  }, [authState.user?.email, authState.user?.uid, userId])

  function isCurrentUserEntry(entry: LeaderboardEntry): boolean {
    const context = resolveLeaderboardUserContext([entry], viewerKeys)
    return Boolean(context)
  }

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [leaderboardFile, matchesFile, picksFile, scoring] = await Promise.all([
          fetchLeaderboard({ mode }),
          fetchMatches({ mode }),
          fetchPicks({ mode }),
          fetchScoring({ mode })
        ])
        if (canceled) return
        const sorted = [...leaderboardFile.entries].sort((a, b) => b.totalPoints - a.totalPoints)
        setState({
          status: 'ready',
          entries: sorted,
          lastUpdated: leaderboardFile.lastUpdated,
          matches: matchesFile.matches,
          picksDocs: picksFile.picks,
          scoring
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
  }, [mode])

  useEffect(() => {
    if (state.status !== 'ready') return
    const currentSnapshot: RankSnapshot = {
      lastUpdated: state.lastUpdated,
      ranks: buildRankSnapshot(state.entries)
    }
    const previousSnapshot = readRankSnapshot(mode)
    const previous =
      previousSnapshot && previousSnapshot.lastUpdated !== state.lastUpdated
        ? previousSnapshot.ranks
        : null
    setPreviousRanks(previous)
    writeRankSnapshot(mode, currentSnapshot)
  }, [mode, state])

  const swingOpportunities = useMemo(() => {
    if (state.status !== 'ready') return []
    return buildSwingOpportunities(state.matches, state.picksDocs, now)
  }, [now, state])

  const summary = useMemo(() => {
    if (state.status !== 'ready') return null
    const leader = state.entries[0] ?? null
    const userContext = resolveLeaderboardUserContext(state.entries, viewerKeys)
    const currentRank = userContext?.current.rank ?? null
    const current = userContext?.current.entry ?? null
    const count = state.entries.length
    const avg = (value: number) => (count > 0 ? Math.round(value / count) : 0)
    const sumTotal = state.entries.reduce((sum, entry) => sum + entry.totalPoints, 0)
    const sumExact = state.entries.reduce((sum, entry) => sum + entry.exactPoints, 0)
    const sumOutcome = state.entries.reduce((sum, entry) => sum + entry.resultPoints, 0)
    const sumKo = state.entries.reduce((sum, entry) => sum + entry.knockoutPoints, 0)
    const sumBracket = state.entries.reduce((sum, entry) => sum + entry.bracketPoints, 0)

    const maxBy = (selector: (entry: LeaderboardEntry) => number) => {
      if (state.entries.length === 0) return null
      return state.entries.reduce((best, entry) => (selector(entry) > selector(best) ? entry : best), state.entries[0])
    }
    const maxTotal = maxBy((entry) => entry.totalPoints)
    const maxExact = maxBy((entry) => entry.exactPoints)
    const maxOutcome = maxBy((entry) => entry.resultPoints)
    const maxKo = maxBy((entry) => entry.knockoutPoints)
    const maxBracket = maxBy((entry) => entry.bracketPoints)

    const closestAbove = userContext?.above?.entry ?? null
    const closestBelow = userContext?.below?.entry ?? null
    const nearestRivalGap =
      current && (closestAbove || closestBelow)
        ? Math.min(
            closestAbove ? Math.abs(closestAbove.totalPoints - current.totalPoints) : Number.POSITIVE_INFINITY,
            closestBelow ? Math.abs(current.totalPoints - closestBelow.totalPoints) : Number.POSITIVE_INFINITY
          )
        : null
    const gapToLeader = leader && current ? Math.max(0, leader.totalPoints - current.totalPoints) : null

    const thirdPlace = state.entries.length >= 3 ? state.entries[2] : null
    const targetPoints = thirdPlace ? thirdPlace.totalPoints + 1 : null
    const pointsToTop3 = targetPoints !== null && current ? Math.max(0, targetPoints - current.totalPoints) : null

    return {
      leader,
      current,
      currentRank,
      closestAbove,
      closestBelow,
      nearestRivalGap,
      gapToLeader,
      swingOpportunityCount: swingOpportunities.length,
      targetPoints,
      pointsToTop3,
      averages: {
        total: avg(sumTotal),
        exact: avg(sumExact),
        outcome: avg(sumOutcome),
        ko: avg(sumKo),
        bracket: avg(sumBracket)
      },
      maxima: {
        total: maxTotal ? { value: maxTotal.totalPoints, name: maxTotal.member.name } : null,
        exact: maxExact ? { value: maxExact.exactPoints, name: maxExact.member.name } : null,
        outcome: maxOutcome ? { value: maxOutcome.resultPoints, name: maxOutcome.member.name } : null,
        ko: maxKo ? { value: maxKo.knockoutPoints, name: maxKo.member.name } : null,
        bracket: maxBracket ? { value: maxBracket.bracketPoints, name: maxBracket.member.name } : null
      }
    }
  }, [state, swingOpportunities.length, viewerKeys])

  const socialBadgesByUser = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, SocialBadge[]>()
    return buildSocialBadgeMap(state.matches, state.picksDocs)
  }, [state])

  const socialBadgesByEntry = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, SocialBadge[]>()
    const byEntry = new Map<string, SocialBadge[]>()
    for (const entry of state.entries) {
      const entryKey = getEntryIdentityKey(entry)
      const seenKinds = new Set<SocialBadge['kind']>()
      const badges: SocialBadge[] = []
      for (const key of buildViewerKeySet(resolveLeaderboardIdentityKeys(entry))) {
        for (const badge of socialBadgesByUser.get(key) ?? []) {
          if (seenKinds.has(badge.kind)) continue
          seenKinds.add(badge.kind)
          badges.push(badge)
        }
      }
      byEntry.set(entryKey, badges)
    }
    return byEntry
  }, [socialBadgesByUser, state])

  const whatIfMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches
      .filter((match) => match.status !== 'FINISHED')
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  }, [state])

  useEffect(() => {
    if (state.status !== 'ready') return
    const validMatchIds = new Set(whatIfMatches.map((match) => match.id))
    setWhatIfDrafts((current) => {
      const next: Record<string, WhatIfDraft> = {}
      let changed = false
      for (const [matchId, draft] of Object.entries(current)) {
        if (!validMatchIds.has(matchId)) {
          changed = true
          continue
        }
        next[matchId] = draft
      }
      return changed ? next : current
    })
  }, [state, whatIfMatches])

  const simulatedOutcomes = useMemo(() => {
    const outcomes: Record<string, SimulatedMatchOutcome> = {}
    for (const [matchId, draft] of Object.entries(whatIfDrafts)) {
      if (!draft.enabled) continue
      outcomes[matchId] = {
        homeScore: draft.homeScore,
        awayScore: draft.awayScore,
        advances: draft.advances
      }
    }
    return outcomes
  }, [whatIfDrafts])

  const projectedRows = useMemo(() => {
    if (state.status !== 'ready') return []
    if (Object.keys(simulatedOutcomes).length === 0) return []
    return buildProjectedLeaderboard(
      state.entries,
      state.matches,
      state.picksDocs,
      state.scoring,
      simulatedOutcomes
    )
  }, [simulatedOutcomes, state])

  const projectedYou = useMemo(() => {
    for (const row of projectedRows) {
      if (resolveLeaderboardUserContext([row.entry], viewerKeys)) return row
    }
    return null
  }, [projectedRows, viewerKeys])

  const currentRankByKey = useMemo(() => {
    if (state.status !== 'ready') return new Map<string, number>()
    const ranks = new Map<string, number>()
    for (let index = 0; index < state.entries.length; index += 1) {
      ranks.set(getEntryIdentityKey(state.entries[index]), index + 1)
    }
    return ranks
  }, [state])

  function toggleWhatIfMatch(matchId: string) {
    setWhatIfDrafts((current) => {
      const existing = current[matchId]
      if (existing) {
        return {
          ...current,
          [matchId]: { ...existing, enabled: !existing.enabled }
        }
      }
      return {
        ...current,
        [matchId]: { enabled: true, homeScore: 0, awayScore: 0 }
      }
    })
  }

  function updateWhatIfScore(match: Match, side: 'home' | 'away', nextScore: number) {
    setWhatIfDrafts((current) => {
      const existing = current[match.id] ?? { enabled: true, homeScore: 0, awayScore: 0 }
      const next: WhatIfDraft =
        side === 'home'
          ? { ...existing, enabled: true, homeScore: nextScore }
          : { ...existing, enabled: true, awayScore: nextScore }

      if (match.stage === 'Group') {
        next.advances = undefined
      } else if (next.homeScore !== next.awayScore) {
        next.advances = undefined
      }

      return {
        ...current,
        [match.id]: next
      }
    })
  }

  function updateWhatIfAdvance(matchId: string, advances: 'HOME' | 'AWAY') {
    setWhatIfDrafts((current) => {
      const existing = current[matchId] ?? { enabled: true, homeScore: 0, awayScore: 0 }
      return {
        ...current,
        [matchId]: { ...existing, enabled: true, advances }
      }
    })
  }

  function openAdvancedMetrics() {
    setAdvancedOpen(true)
    if (typeof document === 'undefined') return
    const node = document.getElementById('league-advanced-metrics')
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    setPage(1)
  }, [state.status === 'ready' ? state.entries.length : 0])

  useEffect(() => {
    const row = currentRowRef.current
    if (!row) {
      setIsCurrentRowVisible(true)
      return
    }
    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setIsCurrentRowVisible(true)
      return
    }

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        setIsCurrentRowVisible(entry.isIntersecting)
      },
      { threshold: 0.2 }
    )
    observer.observe(row)
    return () => observer.disconnect()
  }, [page, state.status === 'ready' ? state.entries.length : 0])

  if (state.status === 'loading') {
    return <LeaderboardSkeleton />
  }

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load leaderboard">
        {state.message}
      </Alert>
    )
  }

  const totalPages = Math.max(1, Math.ceil(state.entries.length / LEADERBOARD_LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * LEADERBOARD_LIST_PAGE_SIZE
  const pageRows = state.entries.slice(start, start + LEADERBOARD_LIST_PAGE_SIZE)

  const closestAboveKey = summary?.closestAbove ? getEntryIdentityKey(summary.closestAbove) : null
  const closestBelowKey = summary?.closestBelow ? getEntryIdentityKey(summary.closestBelow) : null

  const podiumEntries = state.entries.slice(0, 3)
  const centerPodiumEntry = podiumEntries[0] ?? null
  const leftPodiumEntry = podiumEntries[1] ?? null
  const rightPodiumEntry = podiumEntries[2] ?? null
  const featuredRival = summary?.closestAbove ?? summary?.closestBelow ?? summary?.leader ?? null
  const featuredGap =
    summary?.current && featuredRival ? Math.abs(featuredRival.totalPoints - summary.current.totalPoints) : null

  const progressTarget = summary?.targetPoints ?? 0
  const currentPoints = summary?.current?.totalPoints ?? 0
  const progressPercent =
    progressTarget > 0
      ? Math.max(0, Math.min(100, Math.round((Math.min(currentPoints, progressTarget) / progressTarget) * 100)))
      : 0
  const stickyUserRow = summary?.current ?? null
  const shouldShowStickyRow = Boolean(stickyUserRow) && !isCurrentRowVisible
  const activeSimulationCount = Object.keys(simulatedOutcomes).length
  const projectedRankDelta =
    summary?.currentRank && projectedYou ? summary.currentRank - projectedYou.projectedRank : null

  function jumpToCurrentUserRow() {
    if (!summary?.currentRank) return
    const targetPage = Math.max(1, Math.ceil(summary.currentRank / LEADERBOARD_LIST_PAGE_SIZE))
    setPage(targetPage)
    window.setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Standings"
        title="Leaderboard"
        subtitle="Live broadcast mode for the private league race."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(state.lastUpdated)}</div>
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Card className={podiumSurface({ tone: 'podium' })}>
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Podium race</div>
                <Badge tone="secondary">Top 3</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {leftPodiumEntry ? (
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm md:mt-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">#2</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">{leftPodiumEntry.member.name}</div>
                    <div className="mt-2 text-xl font-black uppercase tracking-tight text-foreground">
                      {leftPodiumEntry.totalPoints}
                      <span className="ml-1 text-[10px] text-muted-foreground">PTS</span>
                    </div>
                  </div>
                ) : null}
                {centerPodiumEntry ? (
                  <div className="rounded-2xl border border-[var(--border-accent)] bg-card/80 p-4 shadow-[0_0_0_1px_var(--border-accent),0_0_26px_var(--glow)] backdrop-blur-sm">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">#1</div>
                    <div className="mt-1 truncate text-base font-semibold text-foreground">{centerPodiumEntry.member.name}</div>
                    <div className="mt-2 text-2xl font-black uppercase tracking-tight text-foreground">
                      {centerPodiumEntry.totalPoints}
                      <span className="ml-1 text-[10px] text-muted-foreground">PTS</span>
                    </div>
                  </div>
                ) : null}
                {rightPodiumEntry ? (
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm md:mt-8">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">#3</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">{rightPodiumEntry.member.name}</div>
                    <div className="mt-2 text-xl font-black uppercase tracking-tight text-foreground">
                      {rightPodiumEntry.totalPoints}
                      <span className="ml-1 text-[10px] text-muted-foreground">PTS</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className={podiumSurface({ tone: 'rival' })}>
            <div className="p-5">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Featured rival</div>
              <div className="mt-2 text-base font-semibold text-foreground">{featuredRival?.member.name ?? 'No rival yet'}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {featuredGap !== null
                  ? `${featuredGap} pts from your row`
                  : 'Submit picks and scoring updates to unlock rival tracking.'}
              </div>
              <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Path to top 3</span>
                  <span>{progressPercent}%</span>
                </div>
                <ProgressPrimitive.Root
                  value={progressPercent}
                  max={100}
                  className="mt-2 h-3 overflow-hidden rounded-full border border-border/70 bg-bg2"
                >
                  <ProgressPrimitive.Indicator
                    className={cn(
                      'relative h-full w-full bg-primary transition-transform duration-700 ease-out',
                      'before:absolute before:inset-0 before:[background:linear-gradient(90deg,transparent,rgba(var(--fg0-rgb),0.28),transparent)] before:[background-size:200%_100%] before:animate-[shimmer_2.2s_linear_infinite]'
                    )}
                    style={{ transform: `translateX(-${100 - progressPercent}%)` }}
                  />
                </ProgressPrimitive.Root>
                <div className="mt-2 text-xs text-muted-foreground">
                  {summary?.pointsToTop3 === null
                    ? 'Need at least three scored players to compute this target.'
                    : summary?.pointsToTop3 === 0
                      ? 'You are already in the top 3. Defend the spot.'
                      : `${summary?.pointsToTop3 ?? 0} pts to crash top 3.`}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => navigate('/play')}>
                  Open Play Center
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setSimulatorOpen(true)}>
                  Open What-If Simulator
                </Button>
                <Button size="sm" variant="secondary" onClick={openAdvancedMetrics}>
                  Open advanced metrics
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </PageHeroPanel>

      <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
        <div className="overflow-x-auto">
          <div className="min-w-[1050px] space-y-2">
            <div className="grid grid-cols-[88px_96px_minmax(220px,1fr)_96px_96px_96px_96px_96px] gap-2 px-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              <div>Rank</div>
              <div>Momentum</div>
              <div>Player</div>
              <div>Total</div>
              <div>Exact</div>
              <div>Outcome</div>
              <div>KO</div>
              <div>Bracket</div>
            </div>
            {pageRows.map((entry, index) => {
              const rank = start + index + 1
              const entryKey = getEntryIdentityKey(entry)
              const entryBadges = socialBadgesByEntry.get(entryKey) ?? []
              const isYou = isCurrentUserEntry(entry)
              const isClosestAbove = closestAboveKey !== null && entryKey === closestAboveKey
              const isClosestBelow = closestBelowKey !== null && entryKey === closestBelowKey
              const rowIntent = isYou ? 'user' : isClosestAbove || isClosestBelow ? 'rival' : 'default'
              const previousRank = previousRanks?.[entryKey]
              const movementDelta = typeof previousRank === 'number' ? previousRank - rank : 0
              const movementDirection = getMovementDirection(movementDelta)
              const movementGlyph = movementDirection === 'up' ? '↑' : movementDirection === 'down' ? '↓' : '—'

              return (
                <div key={entry.member.id} className="space-y-1">
                  <div
                    ref={isYou ? currentRowRef : null}
                    className={leaderboardRow({ intent: rowIntent })}
                  >
                    <div className="text-base font-black uppercase tracking-tight text-foreground">#{rank}</div>
                    <div className="flex items-center gap-0.5">
                      {movementDirection === 'flat' ? (
                        <span className={momentumChevron({ direction: 'flat' })}>—</span>
                      ) : (
                        <>
                          <span className={cn(momentumChevron({ direction: movementDirection }), 'animate-pulse')}>
                            {movementGlyph}
                          </span>
                          <span
                            className={cn(
                              momentumChevron({ direction: movementDirection }),
                              'animate-pulse opacity-70 [animation-delay:120ms]'
                            )}
                          >
                            {movementGlyph}
                          </span>
                          {Math.abs(movementDelta) > 1 ? (
                            <span
                              className={cn(
                                'ml-1 text-xs font-black',
                                movementDirection === 'up' ? 'text-success' : 'text-destructive'
                              )}
                            >
                              {Math.abs(movementDelta)}
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{entry.member.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {isYou ? <Badge tone="info">You</Badge> : null}
                        {!isYou && isClosestAbove ? <Badge tone="warning">Closest above</Badge> : null}
                        {!isYou && isClosestBelow ? <Badge tone="secondary">Closest below</Badge> : null}
                      </div>
                    </div>
                    <div className="text-lg font-black uppercase tracking-tight text-foreground">
                      {entry.totalPoints}
                      <span className="ml-1 text-[10px] text-muted-foreground">PTS</span>
                    </div>
                    <div className="text-sm font-semibold text-foreground">{entry.exactPoints}</div>
                    <div className="text-sm font-semibold text-foreground">{entry.resultPoints}</div>
                    <div className="text-sm font-semibold text-foreground">{entry.knockoutPoints}</div>
                    <div className="text-sm font-semibold text-foreground">{entry.bracketPoints}</div>
                  </div>
                  <DetailsDisclosure
                    title="Signals"
                    meta={entryBadges.length > 0 ? `${entryBadges.length} badges` : 'No badges'}
                    defaultOpen={isYou}
                    className="bg-bg2/35"
                  >
                    {entryBadges.length === 0 ? (
                      <PanelState className="text-xs" tone="empty" message="No social badges yet." />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {entryBadges.map((badge) => (
                          <div key={`${entryKey}-${badge.kind}`} className="space-y-1">
                            <SocialBadgePill badge={badge} />
                            <div className="px-1 text-[11px] text-muted-foreground">{badge.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </DetailsDisclosure>
                </div>
              )
            })}
          </div>
        </div>

        {state.entries.length > LEADERBOARD_LIST_PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Showing {start + 1}-{Math.min(start + LEADERBOARD_LIST_PAGE_SIZE, state.entries.length)} of {state.entries.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </Button>
              <div className="text-xs text-muted-foreground">
                Page {safePage} / {totalPages}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {shouldShowStickyRow && stickyUserRow ? (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-5xl" data-testid="leaderboard-sticky-user-row">
          <div className="rounded-2xl border border-[var(--border-accent)] bg-[var(--accent-soft)]/90 p-3 shadow-[0_0_0_1px_var(--border-accent),0_0_24px_var(--glow)] backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Your row</div>
                <div className="text-sm font-semibold text-foreground">
                  #{summary?.currentRank} {stickyUserRow.member.name}
                </div>
                <div className="text-xs text-muted-foreground">{stickyUserRow.totalPoints} pts</div>
              </div>
              <Button size="sm" variant="secondary" onClick={jumpToCurrentUserRow}>
                Jump to row
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailsDisclosure
          title="What to pick next"
          meta={swingOpportunities.length > 0 ? `${Math.min(3, swingOpportunities.length)} shown` : 'No open opportunities'}
        >
          {swingOpportunities.length === 0 ? (
            <PanelState message="No open matches available for swing-based hints." tone="empty" />
          ) : (
            <div className="space-y-3">
              {swingOpportunities.slice(0, 3).map((opportunity) => (
                <div key={opportunity.matchId} className="rounded-xl border border-border/70 bg-bg2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">{opportunity.label}</div>
                    <Badge tone="warning">Swing {Math.round(opportunity.swingScore * 100)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Locks {formatTime(opportunity.lockUtc)} · Kick {formatTime(opportunity.kickoffUtc)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {opportunity.consensusTeam && opportunity.consensusPct !== null
                      ? `Consensus: ${opportunity.consensusTeam} ${opportunity.consensusPct}% (${opportunity.votes} picks)`
                      : 'Consensus: no picks yet'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DetailsDisclosure>

        {summary ? (
          <div id="league-advanced-metrics">
            <DetailsDisclosure title="League distribution details" className="scroll-mt-5" defaultOpen={advancedOpen}>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-2xl border-border/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Section averages</div>
                  <div className="mt-2 text-sm text-foreground">Total: {summary.averages.total}</div>
                  <div className="mt-1 text-sm text-foreground">Exact: {summary.averages.exact}</div>
                  <div className="mt-1 text-sm text-foreground">Outcome: {summary.averages.outcome}</div>
                  <div className="mt-1 text-sm text-foreground">KO: {summary.averages.ko}</div>
                  <div className="mt-1 text-sm text-foreground">Bracket: {summary.averages.bracket}</div>
                </Card>
                <Card className="rounded-2xl border-border/60 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Section maxima</div>
                  <div className="mt-2 text-sm text-foreground">
                    Total: {summary.maxima.total?.value ?? 0} ({summary.maxima.total?.name ?? '—'})
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    Exact: {summary.maxima.exact?.value ?? 0} ({summary.maxima.exact?.name ?? '—'})
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    Outcome: {summary.maxima.outcome?.value ?? 0} ({summary.maxima.outcome?.name ?? '—'})
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    KO: {summary.maxima.ko?.value ?? 0} ({summary.maxima.ko?.name ?? '—'})
                  </div>
                  <div className="mt-1 text-sm text-foreground">
                    Bracket: {summary.maxima.bracket?.value ?? 0} ({summary.maxima.bracket?.name ?? '—'})
                  </div>
                </Card>
              </div>
            </DetailsDisclosure>
          </div>
        ) : null}
      </div>

      <Sheet open={simulatorOpen} onOpenChange={setSimulatorOpen}>
        <SheetContent side="right" className="w-[96vw] max-w-2xl p-0">
          <SheetHeader>
            <SheetTitle>What-If Simulator</SheetTitle>
            <SheetDescription>
              Model hypothetical upcoming match results and preview projected ranks.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            <div className="rounded-xl border border-dashed border-[var(--border-accent)] bg-[var(--accent-soft)]/35 p-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Simulation mode</div>
              <div className="mt-1 text-sm text-foreground">
                Simulated projections only. Live leaderboard data remains unchanged.
              </div>
            </div>

            {whatIfMatches.length === 0 ? (
              <PanelState message="No upcoming matches available for simulation." tone="empty" />
            ) : (
              <div className="space-y-3">
                {whatIfMatches.map((match) => {
                  const draft = whatIfDrafts[match.id] ?? { enabled: false, homeScore: 0, awayScore: 0 }
                  const tieNeedsAdvance = match.stage !== 'Group' && draft.enabled && draft.homeScore === draft.awayScore

                  return (
                    <div key={`what-if-${match.id}`} className="rounded-xl border border-border/70 bg-bg2/45 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {match.homeTeam.code} vs {match.awayTeam.code}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {match.stage} · Kick {formatTime(match.kickoffUtc)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={draft.enabled ? 'primary' : 'secondary'}
                            onClick={() => toggleWhatIfMatch(match.id)}
                          >
                            {draft.enabled ? 'Included' : 'Include'}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!whatIfDrafts[match.id]}
                            onClick={() =>
                              setWhatIfDrafts((current) => {
                                const next = { ...current }
                                delete next[match.id]
                                return next
                              })
                            }
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ScoreStepper
                          label={`${match.homeTeam.code} score`}
                          value={draft.homeScore}
                          disabled={!draft.enabled}
                          onChange={(next) => updateWhatIfScore(match, 'home', next)}
                        />
                        <ScoreStepper
                          label={`${match.awayTeam.code} score`}
                          value={draft.awayScore}
                          disabled={!draft.enabled}
                          onChange={(next) => updateWhatIfScore(match, 'away', next)}
                        />
                      </div>

                      {tieNeedsAdvance ? (
                        <div className="mt-3 rounded-xl border border-border/70 bg-card/60 p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Tiebreak winner
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={draft.advances === 'HOME' ? 'primary' : 'secondary'}
                              onClick={() => updateWhatIfAdvance(match.id, 'HOME')}
                            >
                              {match.homeTeam.code} advances
                            </Button>
                            <Button
                              size="sm"
                              variant={draft.advances === 'AWAY' ? 'primary' : 'secondary'}
                              onClick={() => updateWhatIfAdvance(match.id, 'AWAY')}
                            >
                              {match.awayTeam.code} advances
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="rounded-xl border border-[rgba(var(--info-rgb),0.45)] bg-[rgba(var(--info-rgb),0.08)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">Projected leaderboard</div>
                <Badge tone="info">{activeSimulationCount} simulated matches</Badge>
              </div>
              {projectedYou ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Your projected rank: #{projectedYou.projectedRank}
                  {projectedRankDelta === null
                    ? ''
                    : projectedRankDelta > 0
                      ? ` (+${projectedRankDelta})`
                      : projectedRankDelta < 0
                        ? ` (${projectedRankDelta})`
                        : ' (no change)'}
                </div>
              ) : null}

              {projectedRows.length === 0 ? (
                <PanelState className="mt-3 text-xs" message="Include a match above to generate projections." tone="empty" />
              ) : (
                <div className="mt-3 space-y-2">
                  {projectedRows.slice(0, 8).map((row) => {
                    const rowKey = getEntryIdentityKey(row.entry)
                    const currentRank = currentRankByKey.get(rowKey) ?? row.projectedRank
                    const rankChange = currentRank - row.projectedRank
                    const isYou = isCurrentUserEntry(row.entry)
                    return (
                      <div key={`projected-${rowKey}`} className="rounded-lg border border-border/60 bg-card/80 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-foreground">
                            #{row.projectedRank} {row.entry.member.name}
                          </div>
                          <div className="flex items-center gap-2">
                            {isYou ? <Badge tone="info">You</Badge> : null}
                            <Badge tone={row.projectedDelta > 0 ? 'success' : 'secondary'}>
                              {row.projectedDelta >= 0 ? '+' : ''}
                              {row.projectedDelta} pts
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Total {row.projectedTotalPoints} · Rank change {rankChange >= 0 ? '+' : ''}
                          {rankChange}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-border/60 p-4">
            <SheetClose asChild>
              <Button variant="secondary">Close</Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
