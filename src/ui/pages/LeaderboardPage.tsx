import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Pick } from '../../types/picks'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import PanelState from '../components/ui/PanelState'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import LeaderboardPodium from '../components/v2/LeaderboardPodium'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import { LEADERBOARD_LIST_PAGE_SIZE } from '../constants/pagination'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys, resolveLeaderboardUserContext } from '../lib/leaderboardContext'
import { fetchRivalDirectory, readUserProfile, type RivalDirectoryEntry } from '../lib/profilePersistence'
import { buildSocialBadgeMap, type SocialBadge } from '../lib/socialBadges'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { cn } from '../lib/utils'

const RANK_SNAPSHOT_STORAGE_KEY = 'wc-leaderboard-rank-snapshot'
const LEADERBOARD_VIEW_STORAGE_KEY = 'wc-leaderboard-view'

type LeaderboardView = 'potential' | 'final'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[]
    }

type RankSnapshot = {
  lastUpdated: string
  ranks: Record<string, number>
  points?: Record<string, number>
}

type RivalFocusRow = {
  id: string
  name: string
  rank: number | null
  points: number | null
  rankDelta: number | null
  pointsDelta: number | null
  kind: 'you' | 'rival'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((value) => csvEscape(value)).join(',')).join('\n')
}

function downloadCsvFile(fileName: string, content: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  window.document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function normalizeViewParam(value: string | null | undefined): LeaderboardView | null {
  if (value === 'potential' || value === 'final') return value
  return null
}

function isViewAllowed(view: LeaderboardView | null, finalAvailable: boolean): view is LeaderboardView {
  if (view === 'potential') return true
  return view === 'final' && finalAvailable
}

function resolveDefaultView(finalAvailable: boolean): LeaderboardView {
  return finalAvailable ? 'final' : 'potential'
}

function readStoredView(mode: 'default' | 'demo'): LeaderboardView | null {
  if (typeof window === 'undefined') return null
  return normalizeViewParam(window.localStorage.getItem(`${LEADERBOARD_VIEW_STORAGE_KEY}:${mode}`))
}

function writeStoredView(mode: 'default' | 'demo', view: LeaderboardView): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${LEADERBOARD_VIEW_STORAGE_KEY}:${mode}`, view)
}

function getEntryIdentityKey(entry: LeaderboardEntry): string {
  const id = entry.member.id?.trim().toLowerCase()
  if (id) return `id:${id}`
  return `name:${entry.member.name.trim().toLowerCase()}`
}

function buildRankSnapshot(entries: LeaderboardEntry[]): Record<string, number> {
  const snapshot: Record<string, number> = {}
  for (let index = 0; index < entries.length; index += 1) {
    snapshot[getEntryIdentityKey(entries[index])] = index + 1
  }
  return snapshot
}

function buildPointsSnapshot(entries: LeaderboardEntry[]): Record<string, number> {
  const snapshot: Record<string, number> = {}
  for (const entry of entries) {
    snapshot[getEntryIdentityKey(entry)] = entry.totalPoints
  }
  return snapshot
}

function readRankSnapshot(mode: 'default' | 'demo', view: LeaderboardView): RankSnapshot | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(`${RANK_SNAPSHOT_STORAGE_KEY}:${mode}:${view}`)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { lastUpdated?: unknown; ranks?: unknown; points?: unknown }
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

    const points =
      parsed.points && typeof parsed.points === 'object' && !Array.isArray(parsed.points)
        ? (Object.fromEntries(
            Object.entries(parsed.points).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
          ) as Record<string, number>)
        : undefined

    return {
      lastUpdated: parsed.lastUpdated,
      ranks,
      points
    }
  } catch {
    return null
  }
}

function writeRankSnapshot(mode: 'default' | 'demo', view: LeaderboardView, snapshot: RankSnapshot): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${RANK_SNAPSHOT_STORAGE_KEY}:${mode}:${view}`, JSON.stringify(snapshot))
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = viewerId.trim().toLowerCase()
  const seen = new Set<string>()
  const next: string[] = []

  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
    if (next.length >= 3) break
  }

  return next
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function resolvePersistedRivalIds(
  mode: 'default' | 'demo',
  profileRivalUserIds: string[],
  viewerId: string,
  directory: RivalDirectoryEntry[]
): string[] {
  const sanitized = sanitizeRivalUserIds(profileRivalUserIds, viewerId)
  if (mode !== 'default') return sanitized

  const directoryById = new Map<string, string>()
  for (const entry of directory) {
    const trimmed = entry.id?.trim()
    if (!trimmed) continue
    directoryById.set(normalizeIdentity(trimmed), trimmed)
  }

  const viewerKey = normalizeIdentity(viewerId)
  const seen = new Set<string>()
  const resolved: string[] = []

  for (const rivalId of sanitized) {
    const canonicalId = directoryById.get(normalizeIdentity(rivalId))
    if (!canonicalId) continue
    const canonicalKey = normalizeIdentity(canonicalId)
    if (!canonicalKey || canonicalKey === viewerKey || seen.has(canonicalKey)) continue
    seen.add(canonicalKey)
    resolved.push(canonicalId)
    if (resolved.length >= 3) break
  }

  return resolved
}

function socialBadgeTone(kind: SocialBadge['kind']): 'success' | 'warning' | 'secondary' {
  if (kind === 'perfect_pick') return 'success'
  if (kind === 'contrarian') return 'warning'
  return 'secondary'
}

function movementTone(delta: number | null): 'success' | 'danger' | 'secondary' {
  if (delta === null) return 'secondary'
  if (delta > 0) return 'success'
  if (delta < 0) return 'danger'
  return 'secondary'
}

function movementLabel(delta: number | null): string {
  if (delta === null) return 'Momentum -'
  if (delta > 0) return `Momentum +${delta}`
  if (delta < 0) return `Momentum -${Math.abs(delta)}`
  return 'Momentum ='
}

function rankDeltaLabel(delta: number | null): string {
  if (delta === null) return 'Rank -'
  if (delta > 0) return `Rank +${delta}`
  if (delta < 0) return `Rank -${Math.abs(delta)}`
  return 'Rank ='
}

function pointsDeltaLabel(delta: number | null): string {
  if (delta === null) return 'Pts -'
  if (delta > 0) return `Pts +${delta}`
  if (delta < 0) return `Pts ${delta}`
  return 'Pts ='
}

function shouldShowMomentumPill(delta: number | null): boolean {
  return delta !== null && delta !== 0
}

function LeaderboardSkeleton() {
  return (
    <PageShellV2 className="landing-v2-canvas p-4">
      <div className="h-40 animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
      <div className="h-48 animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
      <div className="h-[34rem] animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
    </PageShellV2>
  )
}

function RivalFocusPanel({
  rows,
  selectedCount,
  snapshotTimestamp,
  onManageRivals
}: {
  rows: RivalFocusRow[]
  selectedCount: number
  snapshotTimestamp: string
  onManageRivals: () => void
}) {
  const rivalRows = rows.filter((row) => row.kind === 'rival')

  return (
    <section className="landing-v2-standings-panel rounded-xl border p-3 md:p-4" aria-label="Rival focus panel">
      <div className="landing-v2-rivals-header-row flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[color:var(--v2-text-strong)]">Rival focus</div>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot " />
          <span>{selectedCount}/3 selected</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div
            key={`rival-focus-${row.kind}-${row.id}`}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg border px-3 py-2',
              row.kind === 'you'
                ? 'border-[color:var(--v2-glow-medium)] bg-[rgba(var(--info-rgb),0.08)]'
                : 'border-border/70 bg-background/40'
            )}
          >
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-foreground">{row.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge tone={row.kind === 'you' ? 'info' : 'warning'} className="px-2 py-0 text-[10px] normal-case tracking-normal">
                  {row.kind === 'you' ? 'You' : 'Rival'}
                </Badge>
                {row.rankDelta !== null ? (
                  <Badge tone={movementTone(row.rankDelta)} className="px-2 py-0 text-[10px] normal-case tracking-normal">
                    {rankDeltaLabel(row.rankDelta)}
                  </Badge>
                ) : null}
                {row.pointsDelta !== null ? (
                  <Badge tone={movementTone(row.pointsDelta)} className="px-2 py-0 text-[10px] normal-case tracking-normal">
                    {pointsDeltaLabel(row.pointsDelta)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="text-right text-[12px] text-muted-foreground">
              <div className="tabular-nums font-semibold text-foreground">{row.rank ? `#${row.rank}` : 'Unranked'}</div>
              <div className="tabular-nums">{row.points ?? '-'} pts</div>
            </div>
          </div>
        ))}
      </div>

      {rivalRows.length === 0 ? (
        <PanelState
          className="mt-3 text-xs"
          tone="empty"
          message="No rivals selected. Add rivals on the landing page to track head-to-head movement here."
        />
      ) : null}

      <div className="mt-3">
        <Button size="sm" variant="secondary" className="h-8 rounded-lg px-3 text-[12px]" onClick={onManageRivals}>
          Manage rivals
        </Button>
      </div>
    </section>
  )
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const phaseState = useTournamentPhaseState()
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')

  const [page, setPage] = useState(1)
  const [view, setView] = useState<LeaderboardView>('potential')
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const [rivalDirectoryEntries, setRivalDirectoryEntries] = useState<RivalDirectoryEntry[]>([])
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [previousSnapshot, setPreviousSnapshot] = useState<RankSnapshot | null>(null)
  const [isCurrentRowVisible, setIsCurrentRowVisible] = useState(true)

  const publishedSnapshot = usePublishedSnapshot()
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const landingRoot = mode === 'demo' ? '/demo' : '/'

  const viewerKeys = useMemo(() => buildViewerKeySet([userId]), [userId])
  const rivalKeys = useMemo(() => buildViewerKeySet(rivalUserIds), [rivalUserIds])

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null

  const leaderboardPresentation = useMemo(() => {
    if (!snapshotReady) return null
    return buildLeaderboardPresentation({
      snapshotTimestamp: snapshotReady.snapshotTimestamp,
      groupStageComplete: snapshotReady.groupStageComplete,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      leaderboardRows: snapshotReady.leaderboardRows
    })
  }, [snapshotReady])

  const potentialRows = snapshotReady?.leaderboardRows ?? []
  const finalRows = leaderboardPresentation?.rows ?? []
  const finalAvailable = Boolean(snapshotReady?.groupStageComplete)
  const snapshotTimestamp = snapshotReady?.snapshotTimestamp ?? ''

  const activeRows = useMemo(
    () => (view === 'final' && finalAvailable ? finalRows : potentialRows),
    [finalAvailable, finalRows, potentialRows, view]
  )

  function syncViewInUrl(nextView: LeaderboardView, replace = true) {
    const params = new URLSearchParams(location.search)
    params.set('view', nextView)
    const nextSearch = params.toString()
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : ''
      },
      { replace }
    )
  }

  function handleViewChange(nextView: LeaderboardView) {
    if (!isViewAllowed(nextView, finalAvailable)) return
    setView(nextView)
    writeStoredView(mode, nextView)
    syncViewInUrl(nextView)
  }

  useEffect(() => {
    if (!snapshotReady) return

    const params = new URLSearchParams(location.search)
    const queryView = normalizeViewParam(params.get('view'))
    const storedView = readStoredView(mode)
    const defaultView = resolveDefaultView(finalAvailable)

    const resolvedView = isViewAllowed(queryView, finalAvailable)
      ? queryView
      : isViewAllowed(storedView, finalAvailable)
        ? storedView
        : defaultView

    setView((current) => (current === resolvedView ? current : resolvedView))
    writeStoredView(mode, resolvedView)

    if (queryView !== resolvedView) {
      syncViewInUrl(resolvedView)
    }
  }, [finalAvailable, location.pathname, location.search, mode, navigate, snapshotReady])

  useEffect(() => {
    let canceled = false

    async function loadRivals() {
      try {
        const [profile, directory] = await Promise.all([readUserProfile(mode, userId), fetchRivalDirectory(mode, userId)])
        if (canceled) return
        setRivalDirectoryEntries(directory)
        setRivalUserIds(resolvePersistedRivalIds(mode, profile.rivalUserIds, userId, directory))
      } catch {
        if (canceled) return
        setRivalDirectoryEntries([])
        setRivalUserIds([])
      }
    }

    void loadRivals()

    return () => {
      canceled = true
    }
  }, [mode, userId])

  useEffect(() => {
    let canceled = false

    async function load() {
      setState({ status: 'loading' })
      try {
        let picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[] = []

        if (mode === 'default' && hasFirebase && firebaseDb) {
          try {
            const picksSnap = await getDocs(collection(firebaseDb, 'leagues', getLeagueId(), 'picks'))
            if (canceled) return

            picksDocs = picksSnap.docs.map((docSnap) => {
              const data = docSnap.data() as { userId?: unknown; picks?: unknown; updatedAt?: unknown }
              return {
                userId: (typeof data.userId === 'string' && data.userId.trim()) || docSnap.id,
                picks: Array.isArray(data.picks) ? (data.picks as Pick[]) : [],
                updatedAt:
                  typeof data.updatedAt === 'string' && data.updatedAt.trim()
                    ? data.updatedAt
                    : new Date(0).toISOString()
              }
            })
          } catch {
            picksDocs = []
          }
        }

        setState({
          status: 'ready',
          picksDocs
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
    if (state.status !== 'ready' || !snapshotTimestamp) return

    const currentSnapshot: RankSnapshot = {
      lastUpdated: snapshotTimestamp,
      ranks: buildRankSnapshot(activeRows),
      points: buildPointsSnapshot(activeRows)
    }

    const previous = readRankSnapshot(mode, view)
    setPreviousSnapshot(previous && previous.lastUpdated !== snapshotTimestamp ? previous : null)
    writeRankSnapshot(mode, view, currentSnapshot)
  }, [activeRows, mode, snapshotTimestamp, state.status, view])

  const socialBadgesByUser = useMemo(() => {
    if (state.status !== 'ready' || !snapshotReady) return new Map<string, SocialBadge[]>()
    return buildSocialBadgeMap(snapshotReady.matches, state.picksDocs)
  }, [snapshotReady, state])

  const socialBadgesByEntry = useMemo(() => {
    const byEntry = new Map<string, SocialBadge[]>()

    for (const entry of activeRows) {
      const entryKey = getEntryIdentityKey(entry)
      const seenKinds = new Set<SocialBadge['kind']>()
      const badges: SocialBadge[] = []

      for (const key of resolveLeaderboardIdentityKeys(entry)) {
        for (const badge of socialBadgesByUser.get(key) ?? []) {
          if (seenKinds.has(badge.kind)) continue
          seenKinds.add(badge.kind)
          badges.push(badge)
        }
      }

      byEntry.set(entryKey, badges)
    }

    return byEntry
  }, [activeRows, socialBadgesByUser])

  const rivalDirectoryByIdentity = useMemo(() => {
    const lookup = new Map<string, RivalDirectoryEntry>()

    for (const entry of rivalDirectoryEntries) {
      const rawId = entry.id?.trim()
      if (!rawId) continue
      const normalizedId = normalizeIdentity(rawId)
      lookup.set(rawId, entry)
      lookup.set(normalizedId, entry)
      lookup.set(`id:${normalizedId}`, entry)
    }

    return lookup
  }, [rivalDirectoryEntries])

  function isCurrentUserEntry(entry: LeaderboardEntry): boolean {
    return resolveLeaderboardIdentityKeys(entry).some((key) => viewerKeys.has(key))
  }

  function isRivalEntry(entry: LeaderboardEntry): boolean {
    if (isCurrentUserEntry(entry)) return false
    return resolveLeaderboardIdentityKeys(entry).some((key) => rivalKeys.has(key))
  }

  const userContext = useMemo(() => resolveLeaderboardUserContext(activeRows, viewerKeys), [activeRows, viewerKeys])

  const activeRowsByIdentity = useMemo(() => {
    const map = new Map<string, { entry: LeaderboardEntry; rank: number; entryKey: string }>()

    for (let index = 0; index < activeRows.length; index += 1) {
      const entry = activeRows[index]
      const rank = index + 1
      const entryKey = getEntryIdentityKey(entry)

      for (const key of resolveLeaderboardIdentityKeys(entry)) {
        map.set(key, { entry, rank, entryKey })
      }
    }

    return map
  }, [activeRows])

  const rivalFocusRows = useMemo<RivalFocusRow[]>(() => {
    const rows: RivalFocusRow[] = []

    if (userContext?.current) {
      const currentEntry = userContext.current.entry
      const currentKey = getEntryIdentityKey(currentEntry)
      const previousRank = previousSnapshot?.ranks[currentKey]
      const previousPoints = previousSnapshot?.points?.[currentKey]

      rows.push({
        id: currentEntry.member.id ?? userId,
        name: currentEntry.member.name,
        rank: userContext.current.rank,
        points: currentEntry.totalPoints,
        rankDelta: typeof previousRank === 'number' ? previousRank - userContext.current.rank : null,
        pointsDelta: typeof previousPoints === 'number' ? currentEntry.totalPoints - previousPoints : null,
        kind: 'you'
      })
    } else {
      rows.push({
        id: userId,
        name: 'You',
        rank: null,
        points: null,
        rankDelta: null,
        pointsDelta: null,
        kind: 'you'
      })
    }

    for (const rivalId of rivalUserIds) {
      const rawRivalId = rivalId.trim()
      const rivalIdKey = normalizeIdentity(rawRivalId)
      const rivalLookupKey = rivalIdKey.startsWith('id:') ? rivalIdKey.slice(3) : rivalIdKey
      const lookup = activeRowsByIdentity.get(rivalLookupKey) ?? activeRowsByIdentity.get(rivalIdKey)
      const rivalDirectoryEntry =
        rivalDirectoryByIdentity.get(rawRivalId) ??
        rivalDirectoryByIdentity.get(rivalIdKey) ??
        rivalDirectoryByIdentity.get(rivalLookupKey)
      const rivalDisplayName =
        rivalDirectoryEntry?.displayName?.trim() || lookup?.entry.member.name.trim() || rawRivalId || 'Unknown rival'

      if (!lookup) {
        rows.push({
          id: rivalId,
          name: rivalDisplayName,
          rank: null,
          points: null,
          rankDelta: null,
          pointsDelta: null,
          kind: 'rival'
        })
        continue
      }

      const previousRank = previousSnapshot?.ranks[lookup.entryKey]
      const previousPoints = previousSnapshot?.points?.[lookup.entryKey]

      rows.push({
        id: rivalId,
        name: rivalDisplayName,
        rank: lookup.rank,
        points: lookup.entry.totalPoints,
        rankDelta: typeof previousRank === 'number' ? previousRank - lookup.rank : null,
        pointsDelta: typeof previousPoints === 'number' ? lookup.entry.totalPoints - previousPoints : null,
        kind: 'rival'
      })
    }

    return rows
  }, [activeRowsByIdentity, previousSnapshot, rivalDirectoryByIdentity, rivalUserIds, userContext, userId])

  useEffect(() => {
    setPage(1)
  }, [activeRows.length, view])

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
      { threshold: 0.25 }
    )

    observer.observe(row)
    return () => observer.disconnect()
  }, [activeRows.length, page, view])

  if (state.status === 'loading' || publishedSnapshot.state.status === 'loading') {
    return <LeaderboardSkeleton />
  }

  if (state.status === 'error' || publishedSnapshot.state.status === 'error') {
    const errorMessage =
      state.status === 'error'
        ? state.message
        : publishedSnapshot.state.status === 'error'
          ? publishedSnapshot.state.message
          : 'Unknown error'

    return (
      <Alert tone="danger" title="Unable to load leaderboard">
        {errorMessage}
      </Alert>
    )
  }

  const totalPages = Math.max(1, Math.ceil(activeRows.length / LEADERBOARD_LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * LEADERBOARD_LIST_PAGE_SIZE
  const pageRows = activeRows.slice(start, start + LEADERBOARD_LIST_PAGE_SIZE)

  const stickyUserRow = userContext?.current.entry ?? null
  const shouldShowStickyRow = Boolean(stickyUserRow) && !isCurrentRowVisible

  const podiumRows = activeRows.slice(0, 3).map((entry, index) => ({
    id: entry.member.id || `podium-${index + 1}`,
    name: entry.member.name,
    points: entry.totalPoints,
    rank: (index + 1) as 1 | 2 | 3,
    isViewer: isCurrentUserEntry(entry)
  }))

  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible

  function handleDownloadLeaderboardCsv() {
    const exportedAt = new Date().toISOString()
    const snapshotAsOf = snapshotTimestamp || 'Snapshot unavailable'
    const exportRows = finalRows.length > 0 ? finalRows : potentialRows

    const rows: string[][] = [
      ['exportedAt', exportedAt],
      ['snapshotAsOf', snapshotAsOf],
      ['viewerUserId', userId],
      ['mode', mode === 'demo' ? 'demo' : 'prod'],
      [],
      [
        'rank',
        'userId',
        'name',
        'totalPoints',
        'exactPoints',
        'resultPoints',
        'knockoutPoints',
        'bracketPoints',
        'earliestSubmission'
      ]
    ]

    exportRows.forEach((entry, index) => {
      rows.push([
        String(index + 1),
        entry.member.id ?? '',
        entry.member.name,
        String(entry.totalPoints ?? 0),
        String(entry.exactPoints ?? 0),
        String(entry.resultPoints ?? 0),
        String(entry.knockoutPoints ?? 0),
        String(entry.bracketPoints ?? 0),
        entry.earliestSubmission ?? ''
      ])
    })

    const safeViewerId = userId.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const stamp = exportedAt.replace(/[:.]/g, '-')
    const fileName = `leaderboard-${safeViewerId || 'viewer'}-${stamp}.csv`
    downloadCsvFile(fileName, rowsToCsv(rows))
  }

  function jumpToCurrentUserRow() {
    if (!userContext?.current.rank) return
    const targetPage = Math.max(1, Math.ceil(userContext.current.rank / LEADERBOARD_LIST_PAGE_SIZE))
    setPage(targetPage)
    window.setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  return (
    <PageShellV2 className="landing-v2-canvas p-4">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Standings"
        title="Leaderboard"
        subtitle="Compare your projected and final standings with rivals in one streamlined view."
        actions={
          showExportMenu ? (
            <ExportMenuV2
              scopeLabel="Full leaderboard snapshot (all members)"
              snapshotLabel={formatSnapshotTimestamp(snapshotTimestamp)}
              lockMessage="Post-lock exports only. CSV format."
              onDownloadCsv={handleDownloadLeaderboardCsv}
            />
          ) : undefined
        }
        metadata={
          <>
            <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot " />
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{finalAvailable ? 'Final standings available.' : 'Potential standings active until group stage closes.'}</span>
          </>
        }
      />

      <SectionCardV2 tone="panel" density="none" className="landing-v2-snapshot p-4 md:p-5">
        <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
          <LeaderboardPodium rows={podiumRows} snapshotAvailable={Boolean(snapshotTimestamp)} showCta={false} className="h-full" />
          <RivalFocusPanel
            rows={rivalFocusRows}
            selectedCount={rivalUserIds.length}
            snapshotTimestamp={snapshotTimestamp}
            onManageRivals={() => navigate(landingRoot)}
          />
        </div>
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" className="p-4 md:p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-heading-h2 text-foreground">Full leaderboard</h2>
              <div className="mt-1 text-[13px] text-muted-foreground">Single-row standings with inline social hooks and full score breakdown.</div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex rounded-full border border-border/70 bg-background/45 p-1">
                <Button
                  size="sm"
                  variant="pill"
                  data-active={view === 'potential' ? 'true' : undefined}
                  className="h-8 px-3 text-[11px]"
                  onClick={() => handleViewChange('potential')}
                >
                  Potential
                </Button>
                <Button
                  size="sm"
                  variant="pill"
                  data-active={view === 'final' ? 'true' : undefined}
                  className="h-8 px-3 text-[11px]"
                  onClick={() => handleViewChange('final')}
                  disabled={!finalAvailable}
                  title={finalAvailable ? 'Switch to final standings' : 'Not available yet'}
                >
                  Final
                </Button>
              </div>

              {!finalAvailable ? <span className="text-[12px] text-muted-foreground">Final not available yet.</span> : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px] space-y-2">
              <div className="hidden grid-cols-[72px_minmax(260px,1fr)_110px_72px_72px_72px_72px] gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
                <div>Rank</div>
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
                const isRival = isRivalEntry(entry)
                const isTopThree = rank <= 3
                const previousRank = previousSnapshot?.ranks[entryKey]
                const movementDelta = typeof previousRank === 'number' ? previousRank - rank : null

                return (
                  <article
                    key={`leaderboard-row-${entryKey}`}
                    ref={isYou ? currentRowRef : null}
                    className={cn(
                      'rounded-xl border px-3 py-3 transition-colors focus-within:ring-2 focus-within:ring-ring',
                      isYou
                        ? 'border-[color:var(--v2-glow-medium)] bg-[rgba(var(--info-rgb),0.1)]'
                        : isRival
                          ? 'border-[rgba(var(--secondary-rgb),0.55)] bg-[rgba(var(--secondary-rgb),0.08)]'
                          : isTopThree
                            ? 'border-[rgba(var(--primary-rgb),0.45)] bg-[rgba(var(--primary-rgb),0.07)]'
                            : 'border-border/70 bg-background/35 hover:bg-background/60'
                    )}
                  >
                    <div className="hidden grid-cols-[72px_minmax(260px,1fr)_110px_72px_72px_72px_72px] items-center gap-2 md:grid">
                      <div className="text-base font-semibold tabular-nums text-foreground">#{rank}</div>

                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold text-foreground">{entry.member.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {isYou ? (
                            <Badge tone="info" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                              You
                            </Badge>
                          ) : null}
                          {!isYou && isRival ? (
                            <Badge tone="warning" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                              Rival
                            </Badge>
                          ) : null}
                          {isTopThree ? (
                            <Badge tone="success" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                              Top 3
                            </Badge>
                          ) : null}
                          {shouldShowMomentumPill(movementDelta) ? (
                            <Badge tone={movementTone(movementDelta)} className="px-2 py-0 text-[10px] normal-case tracking-normal">
                              {movementLabel(movementDelta)}
                            </Badge>
                          ) : null}
                          {entryBadges.map((badge) => (
                            <Badge
                              key={`${entryKey}-${badge.kind}`}
                              tone={socialBadgeTone(badge.kind)}
                              className="px-2 py-0 text-[10px] normal-case tracking-normal"
                              title={badge.description}
                            >
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="text-lg font-semibold tabular-nums text-foreground">{entry.totalPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.exactPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.resultPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.knockoutPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.bracketPoints}</div>
                    </div>

                    <div className="space-y-2 md:hidden">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold tabular-nums text-foreground">#{rank}</div>
                          <div className="truncate text-[15px] font-semibold text-foreground">{entry.member.name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-foreground">{entry.totalPoints}</div>
                          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Total</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {isYou ? (
                          <Badge tone="info" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                            You
                          </Badge>
                        ) : null}
                        {!isYou && isRival ? (
                          <Badge tone="warning" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                            Rival
                          </Badge>
                        ) : null}
                        {isTopThree ? (
                          <Badge tone="success" className="px-2 py-0 text-[10px] normal-case tracking-normal">
                            Top 3
                          </Badge>
                        ) : null}
                        {shouldShowMomentumPill(movementDelta) ? (
                          <Badge tone={movementTone(movementDelta)} className="px-2 py-0 text-[10px] normal-case tracking-normal">
                            {movementLabel(movementDelta)}
                          </Badge>
                        ) : null}
                        {entryBadges.map((badge) => (
                          <Badge
                            key={`${entryKey}-mobile-${badge.kind}`}
                            tone={socialBadgeTone(badge.kind)}
                            className="px-2 py-0 text-[10px] normal-case tracking-normal"
                            title={badge.description}
                          >
                            {badge.label}
                          </Badge>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[12px]">
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Exact {entry.exactPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Outcome {entry.resultPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">KO {entry.knockoutPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Bracket {entry.bracketPoints}</div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>

          {activeRows.length > LEADERBOARD_LIST_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-xs text-muted-foreground">
                Showing {start + 1}-{Math.min(start + LEADERBOARD_LIST_PAGE_SIZE, activeRows.length)} of {activeRows.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-lg px-3 text-[12px]"
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
                  className="h-8 rounded-lg px-3 text-[12px]"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SectionCardV2>

      {shouldShowStickyRow && stickyUserRow && userContext?.current.rank ? (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-5xl" data-testid="leaderboard-sticky-user-row">
          <div className="rounded-xl border border-[color:var(--v2-glow-medium)] bg-background/95 p-3 shadow-[0_0_0_1px_color-mix(in_srgb,var(--v2-glow-medium)_65%,transparent),var(--shadow1)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Your row</div>
                <div className="text-sm font-semibold text-foreground">
                  #{userContext.current.rank} {stickyUserRow.member.name}
                </div>
                <div className="text-xs text-muted-foreground">{stickyUserRow.totalPoints} pts</div>
              </div>
              <Button size="sm" variant="secondary" className="h-8 rounded-lg px-3 text-[12px]" onClick={jumpToCurrentUserRow}>
                Jump to row
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShellV2>
  )
}
