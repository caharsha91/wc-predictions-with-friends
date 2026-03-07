import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Pick } from '../../types/picks'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import PanelState from '../components/ui/PanelState'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import LeaderboardPodium from '../components/v2/LeaderboardPodium'
import MemberIdentityRowV2 from '../components/v2/MemberIdentityRowV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import RowShellV2 from '../components/v2/RowShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SideListPanelV2 from '../components/v2/SideListPanelV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import StatusTagV2 from '../components/v2/StatusTagV2'
import { LEADERBOARD_LIST_PAGE_SIZE } from '../constants/pagination'
import { useFavoriteTeamPreference } from '../context/FavoriteTeamPreferenceContext'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useToast } from '../hooks/useToast'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys } from '../lib/leaderboardContext'
import { rankRowsWithTiePriority } from '../lib/leaderboardTieRanking'
import { publishedStateLabel, SNAPSHOT_METADATA_PREFIX } from '../lib/pageStatusCopy'
import { fetchRivalDirectory, readUserProfile, type RivalDirectoryEntry } from '../lib/profilePersistence'
import { buildSocialBadgeMap, type SocialBadge } from '../lib/socialBadges'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { resolveSemanticState } from '../lib/semanticState'
import { normalizeFavoriteTeamCode } from '../lib/teamFlag'
import { downloadWorkbook } from '../lib/exportWorkbook'

const RANK_SNAPSHOT_STORAGE_KEY = 'wc-leaderboard-rank-snapshot'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      picksDocs: { userId: string; picks: Pick[]; updatedAt: string }[]
      socialDataLimited: boolean
    }

type RankSnapshot = {
  lastUpdated: string
  ranks: Record<string, number>
  points?: Record<string, number>
}

type RivalComparison = {
  relation: 'ahead' | 'behind' | 'tied' | 'unranked'
  pointsGap: number | null
}

type RivalFocusRow = {
  id: string
  name: string
  favoriteTeamCode: string | null
  rank: number | null
  tieCount: number | null
  points: number | null
  rankDelta: number | null
  pointsDelta: number | null
  comparison: RivalComparison | null
  kind: 'you' | 'rival'
  rivalSlot?: number | null
}

function getEntryIdentityKey(entry: LeaderboardEntry): string {
  const id = entry.member.id?.trim().toLowerCase()
  if (id) return `id:${id}`
  return `name:${entry.member.name.trim().toLowerCase()}`
}

function buildRankSnapshot(entries: LeaderboardEntry[], rankByEntryKey: Map<string, number>): Record<string, number> {
  const snapshot: Record<string, number> = {}
  for (const entry of entries) {
    const entryKey = getEntryIdentityKey(entry)
    const rank = rankByEntryKey.get(entryKey)
    if (typeof rank === 'number' && Number.isFinite(rank)) {
      snapshot[entryKey] = rank
    }
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

function readRankSnapshot(mode: 'default' | 'demo'): RankSnapshot | null {
  if (typeof window === 'undefined') return null
  const unifiedKey = `${RANK_SNAPSHOT_STORAGE_KEY}:${mode}`
  const legacyFinalKey = `${RANK_SNAPSHOT_STORAGE_KEY}:${mode}:final`

  let raw = window.localStorage.getItem(unifiedKey)
  if (!raw) {
    raw = window.localStorage.getItem(legacyFinalKey)
    if (raw) {
      window.localStorage.setItem(unifiedKey, raw)
    }
  }

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

function writeRankSnapshot(mode: 'default' | 'demo', snapshot: RankSnapshot): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${RANK_SNAPSHOT_STORAGE_KEY}:${mode}`, JSON.stringify(snapshot))
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

function roleBadgeLabel({ isYou, rivalSlot }: { isYou: boolean; rivalSlot: number | null | undefined }): string {
  if (isYou) return 'You'
  return rivalSlot ? `Rival ${rivalSlot}` : 'Rival'
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

function rankLabel(rank: number | null, tieCount: number | null): string {
  if (rank === null) return 'Unranked'
  if (tieCount !== null && tieCount > 1) return `T#${rank}`
  return `#${rank}`
}

function compareAgainstViewer(viewerPoints: number | null, otherPoints: number | null): RivalComparison {
  if (viewerPoints === null || otherPoints === null) {
    return { relation: 'unranked', pointsGap: null }
  }
  if (otherPoints === viewerPoints) {
    return { relation: 'tied', pointsGap: 0 }
  }
  if (otherPoints > viewerPoints) {
    return { relation: 'ahead', pointsGap: otherPoints - viewerPoints }
  }
  return { relation: 'behind', pointsGap: viewerPoints - otherPoints }
}

function comparisonTone(comparison: RivalComparison | null): 'success' | 'danger' | 'info' | 'secondary' {
  if (!comparison) return 'secondary'
  if (comparison.relation === 'behind') return 'success'
  if (comparison.relation === 'ahead') return 'danger'
  if (comparison.relation === 'tied') return 'info'
  return 'secondary'
}

function comparisonLabel(comparison: RivalComparison | null): string {
  if (!comparison || comparison.relation === 'unranked') return 'Not ranked in latest snapshot'
  if (comparison.relation === 'tied') return 'Level with you'
  if (comparison.relation === 'ahead') {
    return comparison.pointsGap && comparison.pointsGap > 0
      ? `Ahead of you by ${comparison.pointsGap} pts`
      : 'Ahead of you'
  }
  return comparison.pointsGap && comparison.pointsGap > 0
    ? `Behind you by ${comparison.pointsGap} pts`
    : 'Behind you'
}

function shouldShowMomentumPill(delta: number | null): boolean {
  return delta !== null && delta !== 0
}

function LeaderboardSkeleton() {
  return (
    <PageShellV2 className="landing-v2-canvas">
      <div className="h-40 animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
      <div className="h-48 animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
      <div className="h-[34rem] animate-pulse rounded-2xl border border-border/70 bg-muted/35" />
    </PageShellV2>
  )
}

function RivalFocusPanel({
  rows,
  selectedCount,
  onManageRivals
}: {
  rows: RivalFocusRow[]
  selectedCount: number
  onManageRivals: () => void
}) {
  const rivalRows = rows.filter((row) => row.kind === 'rival')

  return (
    <SideListPanelV2
      title="Rival watch"
      subtitle="Track up to 3 selected rivals."
      meta={`${selectedCount}/3 selected`}
      className="landing-v2-standings-panel"
      contentClassName="space-y-2"
      footer={
        <Button size="xs" variant="tertiary" className="v2-action-compact" onClick={onManageRivals}>
          Manage rivals
        </Button>
      }
    >
      <div className="space-y-2">
        {rows.map((row) => (
          <RowShellV2
            key={`rival-focus-${row.kind}-${row.id}`}
            depth={row.kind === 'you' ? 'prominent' : 'embedded'}
            state={row.kind === 'you' ? 'you' : 'rival'}
            className="px-3 py-2"
            interactive={false}
          >
            <MemberIdentityRowV2
              name={row.name}
              favoriteTeamCode={row.favoriteTeamCode}
              avatarClassName="h-12 w-[72px]"
              nameBadges={
                <StatusTagV2 tone={row.kind === 'you' ? 'info' : 'warning'} className="v2-role-badge">
                  {row.kind === 'you' ? 'You' : roleBadgeLabel({ isYou: false, rivalSlot: row.rivalSlot })}
                </StatusTagV2>
              }
              subtitle={<span>{rankLabel(row.rank, row.tieCount)} • {row.points ?? '-'} pts</span>}
              badges={(
                <>
                  {row.kind === 'rival' && row.comparison?.relation !== 'tied' ? (
                    <StatusTagV2 tone={comparisonTone(row.comparison)}>{comparisonLabel(row.comparison)}</StatusTagV2>
                  ) : null}
                  {row.rankDelta !== null ? (
                    <StatusTagV2 tone={movementTone(row.rankDelta)}>{rankDeltaLabel(row.rankDelta)}</StatusTagV2>
                  ) : null}
                  {row.pointsDelta !== null ? (
                    <StatusTagV2 tone={movementTone(row.pointsDelta)}>{pointsDeltaLabel(row.pointsDelta)}</StatusTagV2>
                  ) : null}
                </>
              )}
            />
          </RowShellV2>
        ))}
      </div>

      {rivalRows.length === 0 ? (
        <PanelState
          className="mt-2 text-xs"
          tone="empty"
          message="No rivals selected yet. Add rivals in Play Center to track head-to-head movement here."
        />
      ) : null}
    </SideListPanelV2>
  )
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const { showToast } = useToast()
  const phaseState = useTournamentPhaseState()
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const currentUser = useCurrentUser()
  const favoriteTeamPreference = useFavoriteTeamPreference()

  const [page, setPage] = useState(1)
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const [rivalDirectoryEntries, setRivalDirectoryEntries] = useState<RivalDirectoryEntry[]>([])
  const [profileFavoriteTeamCode, setProfileFavoriteTeamCode] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [previousSnapshot, setPreviousSnapshot] = useState<RankSnapshot | null>(null)
  const [isCurrentRowVisible, setIsCurrentRowVisible] = useState(true)

  const publishedSnapshot = usePublishedSnapshot()
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const landingRoot = mode === 'demo' ? '/demo' : '/'

  const viewerKeys = useMemo(
    () =>
      buildViewerKeySet([
        userId,
        currentUser?.id ?? null,
        currentUser?.email ?? null,
        currentUser?.name ?? null
      ]),
    [currentUser?.email, currentUser?.id, currentUser?.name, userId]
  )
  const rivalKeys = useMemo(() => buildViewerKeySet(rivalUserIds), [rivalUserIds])
  const viewerFavoriteTeamCode = useMemo(
    () =>
      normalizeFavoriteTeamCode(
        favoriteTeamPreference.favoriteTeamCode ?? profileFavoriteTeamCode ?? currentUser?.favoriteTeamCode
      ),
    [currentUser?.favoriteTeamCode, favoriteTeamPreference.favoriteTeamCode, profileFavoriteTeamCode]
  )

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

  const activeBaseRows = leaderboardPresentation?.rows ?? []
  const snapshotTimestamp = snapshotReady?.snapshotTimestamp ?? ''

  const activeTieRankedRows = useMemo(
    () =>
      rankRowsWithTiePriority({
        rows: activeBaseRows,
        getPoints: (entry) => entry.totalPoints,
        getIdentityKeys: (entry) => resolveLeaderboardIdentityKeys(entry),
        getName: (entry) => entry.member.name,
        viewerIdentity: userId,
        rivalIdentities: rivalUserIds
      }),
    [activeBaseRows, rivalUserIds, userId]
  )

  const activeRows = activeTieRankedRows.sortedRows

  const rankByEntryKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const { row, rank } of activeTieRankedRows.rankedRows) {
      map.set(getEntryIdentityKey(row), rank)
    }
    return map
  }, [activeTieRankedRows.rankedRows])

  const tieCountByEntryKey = useMemo(() => {
    const tieCountByPoints = new Map<number, number>()
    for (const entry of activeRows) {
      tieCountByPoints.set(entry.totalPoints, (tieCountByPoints.get(entry.totalPoints) ?? 0) + 1)
    }

    const tieCountByKey = new Map<string, number>()
    for (const entry of activeRows) {
      const entryKey = getEntryIdentityKey(entry)
      tieCountByKey.set(entryKey, tieCountByPoints.get(entry.totalPoints) ?? 1)
    }

    return tieCountByKey
  }, [activeRows])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has('view')) return
    params.delete('view')
    const nextSearch = params.toString()

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: location.hash
      },
      { replace: true }
    )
  }, [location.hash, location.pathname, location.search, navigate])

  useEffect(() => {
    let canceled = false

    async function loadRivals() {
      try {
        const [profile, directory] = await Promise.all([readUserProfile(mode, userId), fetchRivalDirectory(mode, userId)])
        if (canceled) return
        setRivalDirectoryEntries(directory)
        setRivalUserIds(resolvePersistedRivalIds(mode, profile.rivalUserIds, userId, directory))
        setProfileFavoriteTeamCode(normalizeFavoriteTeamCode(profile.favoriteTeamCode))
      } catch {
        if (canceled) return
        setRivalDirectoryEntries([])
        setRivalUserIds([])
        setProfileFavoriteTeamCode(null)
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
        let socialDataLimited = false

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
          } catch (error) {
            picksDocs = []
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              typeof (error as { code?: unknown }).code === 'string' &&
              String((error as { code: string }).code).includes('permission-denied')
            ) {
              socialDataLimited = true
            }
          }
        }

        setState({
          status: 'ready',
          picksDocs,
          socialDataLimited
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
      ranks: buildRankSnapshot(activeRows, rankByEntryKey),
      points: buildPointsSnapshot(activeRows)
    }

    const previous = readRankSnapshot(mode)
    setPreviousSnapshot(previous && previous.lastUpdated !== snapshotTimestamp ? previous : null)
    writeRankSnapshot(mode, currentSnapshot)
  }, [activeRows, mode, rankByEntryKey, snapshotTimestamp, state.status])

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
      const rawName = entry.displayName?.trim()
      const rawEmail = entry.email?.trim()
      const normalizedName = normalizeIdentity(rawName)
      const normalizedEmail = normalizeIdentity(rawEmail)
      if (rawId) {
        const normalizedId = normalizeIdentity(rawId)
        lookup.set(rawId, entry)
        lookup.set(normalizedId, entry)
        lookup.set(`id:${normalizedId}`, entry)
      }
      if (rawName) lookup.set(rawName, entry)
      if (normalizedName) {
        lookup.set(normalizedName, entry)
        lookup.set(`name:${normalizedName}`, entry)
      }
      if (rawEmail) lookup.set(rawEmail, entry)
      if (normalizedEmail) {
        lookup.set(normalizedEmail, entry)
        lookup.set(`email:${normalizedEmail}`, entry)
      }
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

  const rivalOrderByKey = useMemo(() => {
    const order = new Map<string, number>()
    for (let index = 0; index < rivalUserIds.length; index += 1) {
      const rivalId = rivalUserIds[index]
      const rivalIdKey = normalizeIdentity(rivalId)
      const rivalLookupKey = rivalIdKey.startsWith('id:') ? rivalIdKey.slice(3) : rivalIdKey
      const rivalDirectoryEntry =
        rivalDirectoryByIdentity.get(rivalId) ??
        rivalDirectoryByIdentity.get(rivalIdKey) ??
        rivalDirectoryByIdentity.get(rivalLookupKey)
      const identityKeys = buildViewerKeySet([
        rivalId,
        rivalDirectoryEntry?.id ?? null,
        rivalDirectoryEntry?.email ?? null,
        rivalDirectoryEntry?.displayName ?? null
      ])
      for (const key of identityKeys) {
        order.set(key, index + 1)
      }
    }
    return order
  }, [rivalDirectoryByIdentity, rivalUserIds])

  function resolveRivalSlot(entry: LeaderboardEntry): number | null {
    if (isCurrentUserEntry(entry)) return null
    for (const key of resolveLeaderboardIdentityKeys(entry)) {
      const slot = rivalOrderByKey.get(normalizeIdentity(key))
      if (typeof slot === 'number') return slot
    }
    return null
  }

  function resolveEntryFavoriteTeamCode(entry: LeaderboardEntry): string | null {
    if (isCurrentUserEntry(entry)) {
      return viewerFavoriteTeamCode
    }

    const memberFavoriteTeamCode = normalizeFavoriteTeamCode(entry.member.favoriteTeamCode)
    const keys = new Set<string>(resolveLeaderboardIdentityKeys(entry))
    const memberId = normalizeIdentity(entry.member.id)
    const memberEmail = normalizeIdentity(entry.member.email)
    const memberName = normalizeIdentity(entry.member.name)

    if (memberId) {
      keys.add(memberId)
      keys.add(`id:${memberId}`)
    }
    if (memberEmail) {
      keys.add(memberEmail)
      keys.add(`email:${memberEmail}`)
    }
    if (memberName) {
      keys.add(memberName)
      keys.add(`name:${memberName}`)
    }

    for (const key of keys) {
      const normalizedKey = normalizeIdentity(key)
      const idLikeKey = normalizedKey.startsWith('id:') ? normalizedKey.slice(3) : normalizedKey
      const rivalEntry =
        rivalDirectoryByIdentity.get(key) ??
        rivalDirectoryByIdentity.get(normalizedKey) ??
        rivalDirectoryByIdentity.get(idLikeKey) ??
        rivalDirectoryByIdentity.get(`id:${idLikeKey}`)
      if (rivalEntry) {
        const rivalFavoriteTeamCode = normalizeFavoriteTeamCode(rivalEntry.favoriteTeamCode)
        if (rivalFavoriteTeamCode) return rivalFavoriteTeamCode
      }
    }

    return memberFavoriteTeamCode
  }

  const userContext = useMemo(() => {
    const currentIndex = activeRows.findIndex((entry) =>
      resolveLeaderboardIdentityKeys(entry).some((key) => viewerKeys.has(key))
    )
    if (currentIndex < 0) return null
    const currentEntry = activeRows[currentIndex]
    const currentEntryKey = getEntryIdentityKey(currentEntry)
    const currentRank = rankByEntryKey.get(currentEntryKey) ?? currentIndex + 1
    const currentTieCount = tieCountByEntryKey.get(currentEntryKey) ?? 1
    const aboveEntry = currentIndex > 0 ? activeRows[currentIndex - 1] : null
    const belowEntry = currentIndex < activeRows.length - 1 ? activeRows[currentIndex + 1] : null

    return {
      current: {
        entry: currentEntry,
        index: currentIndex,
        rank: currentRank,
        tieCount: currentTieCount
      },
      above: aboveEntry
        ? {
            entry: aboveEntry,
            index: currentIndex - 1,
            rank: rankByEntryKey.get(getEntryIdentityKey(aboveEntry)) ?? currentIndex,
            tieCount: tieCountByEntryKey.get(getEntryIdentityKey(aboveEntry)) ?? 1
          }
        : null,
      below: belowEntry
        ? {
            entry: belowEntry,
            index: currentIndex + 1,
            rank: rankByEntryKey.get(getEntryIdentityKey(belowEntry)) ?? currentIndex + 2,
            tieCount: tieCountByEntryKey.get(getEntryIdentityKey(belowEntry)) ?? 1
          }
        : null
    }
  }, [activeRows, rankByEntryKey, tieCountByEntryKey, viewerKeys])

  const activeRowsByIdentity = useMemo(() => {
    const map = new Map<string, { entry: LeaderboardEntry; rank: number; entryKey: string }>()

    for (let index = 0; index < activeRows.length; index += 1) {
      const entry = activeRows[index]
      const entryKey = getEntryIdentityKey(entry)
      const rank = rankByEntryKey.get(entryKey) ?? index + 1
      const nameKey = normalizeIdentity(entry.member.name)
      const emailKey = normalizeIdentity(entry.member.email)
      const idKey = normalizeIdentity(entry.member.id)

      for (const key of resolveLeaderboardIdentityKeys(entry)) {
        map.set(key, { entry, rank, entryKey })
        map.set(normalizeIdentity(key), { entry, rank, entryKey })
      }
      if (nameKey) {
        map.set(nameKey, { entry, rank, entryKey })
        map.set(`name:${nameKey}`, { entry, rank, entryKey })
      }
      if (emailKey) {
        map.set(emailKey, { entry, rank, entryKey })
        map.set(`email:${emailKey}`, { entry, rank, entryKey })
      }
      if (idKey) {
        map.set(idKey, { entry, rank, entryKey })
        map.set(`id:${idKey}`, { entry, rank, entryKey })
      }
    }

    return map
  }, [activeRows, rankByEntryKey])

  const rivalFocusRows = useMemo<RivalFocusRow[]>(() => {
    const rows: RivalFocusRow[] = []
    const viewerPoints = userContext?.current.entry.totalPoints ?? null

    if (userContext?.current) {
      const currentEntry = userContext.current.entry
      const currentKey = getEntryIdentityKey(currentEntry)
      const previousRank = previousSnapshot?.ranks[currentKey]
      const previousPoints = previousSnapshot?.points?.[currentKey]

      rows.push({
        id: currentEntry.member.id ?? userId,
        name: currentEntry.member.name,
        favoriteTeamCode: viewerFavoriteTeamCode,
        rank: userContext.current.rank,
        tieCount: userContext.current.tieCount,
        points: currentEntry.totalPoints,
        rankDelta: typeof previousRank === 'number' ? previousRank - userContext.current.rank : null,
        pointsDelta: typeof previousPoints === 'number' ? currentEntry.totalPoints - previousPoints : null,
        comparison: null,
        kind: 'you',
        rivalSlot: null
      })
    } else {
      rows.push({
        id: userId,
        name: 'You',
        favoriteTeamCode: viewerFavoriteTeamCode,
        rank: null,
        tieCount: null,
        points: null,
        rankDelta: null,
        pointsDelta: null,
        comparison: null,
        kind: 'you',
        rivalSlot: null
      })
    }

    for (let rivalIndex = 0; rivalIndex < rivalUserIds.length; rivalIndex += 1) {
      const rivalId = rivalUserIds[rivalIndex]
      const rivalSlot = rivalIndex + 1
      const rawRivalId = rivalId.trim()
      const rivalIdKey = normalizeIdentity(rawRivalId)
      const rivalLookupKey = rivalIdKey.startsWith('id:') ? rivalIdKey.slice(3) : rivalIdKey
      const rivalDirectoryEntry =
        rivalDirectoryByIdentity.get(rawRivalId) ??
        rivalDirectoryByIdentity.get(rivalIdKey) ??
        rivalDirectoryByIdentity.get(rivalLookupKey)
      const rivalDisplayNameKey = normalizeIdentity(rivalDirectoryEntry?.displayName)
      const rivalEmailKey = normalizeIdentity(rivalDirectoryEntry?.email)
      const rivalAuthIdKey = normalizeIdentity(rivalDirectoryEntry?.id)
      const rivalIdentityKeys = buildViewerKeySet([
        rawRivalId,
        rivalDirectoryEntry?.id ?? null,
        rivalDirectoryEntry?.email ?? null,
        rivalDirectoryEntry?.displayName ?? null
      ])
      const lookup =
        activeRowsByIdentity.get(rivalLookupKey) ??
        activeRowsByIdentity.get(rivalIdKey) ??
        (rivalDisplayNameKey ? activeRowsByIdentity.get(rivalDisplayNameKey) : undefined) ??
        (rivalDisplayNameKey ? activeRowsByIdentity.get(`name:${rivalDisplayNameKey}`) : undefined) ??
        (rivalEmailKey ? activeRowsByIdentity.get(rivalEmailKey) : undefined) ??
        (rivalEmailKey ? activeRowsByIdentity.get(`email:${rivalEmailKey}`) : undefined) ??
        (rivalAuthIdKey ? activeRowsByIdentity.get(rivalAuthIdKey) : undefined) ??
        (rivalAuthIdKey ? activeRowsByIdentity.get(`id:${rivalAuthIdKey}`) : undefined) ??
        [...rivalIdentityKeys]
          .map((key) => activeRowsByIdentity.get(key))
          .find((candidate) => Boolean(candidate))
      const rivalDisplayName =
        rivalDirectoryEntry?.displayName?.trim() || lookup?.entry.member.name.trim() || rawRivalId || 'Unknown rival'
      const rivalFavoriteTeamCode = normalizeFavoriteTeamCode(rivalDirectoryEntry?.favoriteTeamCode)

      if (!lookup) {
        rows.push({
          id: rivalId,
          name: rivalDisplayName,
          favoriteTeamCode: rivalFavoriteTeamCode,
          rank: null,
          tieCount: null,
          points: null,
          rankDelta: null,
          pointsDelta: null,
          comparison: { relation: 'unranked', pointsGap: null },
          kind: 'rival',
          rivalSlot
        })
        continue
      }

      const previousRank = previousSnapshot?.ranks[lookup.entryKey]
      const previousPoints = previousSnapshot?.points?.[lookup.entryKey]

      rows.push({
        id: rivalId,
        name: rivalDisplayName,
        favoriteTeamCode: rivalFavoriteTeamCode,
        rank: lookup.rank,
        tieCount: tieCountByEntryKey.get(lookup.entryKey) ?? 1,
        points: lookup.entry.totalPoints,
        rankDelta: typeof previousRank === 'number' ? previousRank - lookup.rank : null,
        pointsDelta: typeof previousPoints === 'number' ? lookup.entry.totalPoints - previousPoints : null,
        comparison: compareAgainstViewer(viewerPoints, lookup.entry.totalPoints),
        kind: 'rival',
        rivalSlot
      })
    }

    return rows
  }, [
    activeRowsByIdentity,
    previousSnapshot,
    rivalDirectoryByIdentity,
    rivalUserIds,
    tieCountByEntryKey,
    userContext,
    userId,
    viewerFavoriteTeamCode
  ])

  useEffect(() => {
    setPage(1)
  }, [activeRows.length])

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
  }, [activeRows.length, page])

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
  const stickyUserFavoriteTeamCode = stickyUserRow ? resolveEntryFavoriteTeamCode(stickyUserRow) : null
  const stickyUserTieCount = stickyUserRow ? (tieCountByEntryKey.get(getEntryIdentityKey(stickyUserRow)) ?? 1) : null
  const shouldShowStickyRow = Boolean(stickyUserRow) && !isCurrentRowVisible

  const podiumRows = activeRows.slice(0, 3).map((entry, index) => ({
    id: entry.member.id || `podium-${index + 1}`,
    name: entry.member.name,
    points: entry.totalPoints,
    rank: (index + 1) as 1 | 2 | 3,
    displayRank: rankByEntryKey.get(getEntryIdentityKey(entry)) ?? index + 1,
    tieCount: tieCountByEntryKey.get(getEntryIdentityKey(entry)) ?? 1,
    favoriteTeamCode: resolveEntryFavoriteTeamCode(entry),
    isViewer: isCurrentUserEntry(entry)
  }))

  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible
  const leaderboardPublishedCopy = publishedStateLabel(phaseState.tournamentPhase)

  function handleDownloadLeaderboardXlsx() {
    const exportedAt = new Date().toISOString()
    const snapshotAsOf = snapshotTimestamp || 'Snapshot unavailable'
    const exportRows = activeRows

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
      const entryKey = getEntryIdentityKey(entry)
      const rank = rankByEntryKey.get(entryKey) ?? index + 1
      rows.push([
        String(rank),
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
    const fileName = `leaderboard-${safeViewerId || 'viewer'}-${stamp}.xlsx`
    void downloadWorkbook(fileName, [
      {
        name: 'Leaderboard',
        rows,
        headerRowIndices: [5]
      }
    ]).catch(() => {
      showToast({ tone: 'danger', title: 'Export failed', message: 'Unable to prepare leaderboard export.' })
    })
  }

  function jumpToCurrentUserRow() {
    if (!userContext?.current.rank) return
    const targetPage = Math.max(1, Math.ceil((userContext.current.index + 1) / LEADERBOARD_LIST_PAGE_SIZE))
    setPage(targetPage)
    window.setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  return (
    <PageShellV2 className="landing-v2-canvas">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Standings"
        title="Leaderboard"
        subtitle="See where you stand and keep rival banter close from the latest snapshot."
        actions={
          showExportMenu ? (
            <ExportMenuV2
              description={`Download the leaderboard workbook from ${formatSnapshotTimestamp(snapshotTimestamp)}.`}
              onAction={handleDownloadLeaderboardXlsx}
            />
          ) : undefined
        }
        metadataItems={[
          <SnapshotStamp key="snapshot" timestamp={snapshotTimestamp} prefix={SNAPSHOT_METADATA_PREFIX} />,
          <span key="published">{leaderboardPublishedCopy}</span>
        ]}
      />

      {snapshotReady?.projectedGroupPredictionsLimited ? (
        <Alert tone="warning" title="Comparison data limited">
          Some group comparison data is unavailable with your current access.
        </Alert>
      ) : null}

      {state.status === 'ready' && state.socialDataLimited ? (
        <Alert tone="warning" title="Social view limited">
          Some social badges are unavailable with your current access.
        </Alert>
      ) : null}

      <div className="v2-section-flat">
        <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
          <LeaderboardPodium rows={podiumRows} snapshotAvailable={Boolean(snapshotTimestamp)} showCta={false} className="h-full" />
          <RivalFocusPanel
            rows={rivalFocusRows}
            selectedCount={rivalUserIds.length}
            onManageRivals={() => navigate(landingRoot)}
          />
        </div>
      </div>

      <SectionCardV2 tone="panel" density="none" className="p-4 md:p-5">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-heading-h2 text-foreground">Full leaderboard</h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px] space-y-2">
              <div className="v2-type-kicker hidden grid-cols-[72px_minmax(260px,1fr)_110px_72px_72px_72px_72px] gap-2 px-3 md:grid">
                <div>Rank</div>
                <div>Player</div>
                <div>Total</div>
                <div>Exact</div>
                <div>Outcome</div>
                <div>KO</div>
                <div>Bracket</div>
              </div>

              {pageRows.map((entry, index) => {
                const entryKey = getEntryIdentityKey(entry)
                const rank = rankByEntryKey.get(entryKey) ?? start + index + 1
                const tieCount = tieCountByEntryKey.get(entryKey) ?? 1
                const entryBadges = socialBadgesByEntry.get(entryKey) ?? []
                const isYou = isCurrentUserEntry(entry)
                const isRival = isRivalEntry(entry)
                const rivalSlot = resolveRivalSlot(entry)
                const isTopThree = rank <= 3
                const previousRank = previousSnapshot?.ranks[entryKey]
                const movementDelta = typeof previousRank === 'number' ? previousRank - rank : null
                const rowState = resolveSemanticState({
                  you: isYou,
                  rival: !isYou && isRival,
                  selected: !isYou && !isRival && isTopThree
                })
                const favoriteTeamCode = resolveEntryFavoriteTeamCode(entry)

                return (
                  <RowShellV2
                    key={`leaderboard-row-${entryKey}`}
                    ref={isYou ? currentRowRef : null}
                    depth={isYou ? 'prominent' : 'embedded'}
                    state={rowState}
                    className="rounded-xl px-3 py-3 focus-within:ring-2 focus-within:ring-ring"
                  >
                    <div className="hidden grid-cols-[72px_minmax(260px,1fr)_110px_72px_72px_72px_72px] items-center gap-2 md:grid">
                      <div className="text-base font-semibold tabular-nums text-foreground">{rankLabel(rank, tieCount)}</div>

                      <div className="min-w-0">
                        <MemberIdentityRowV2
                          name={entry.member.name}
                          favoriteTeamCode={favoriteTeamCode}
                          avatarClassName="h-12 w-[72px]"
                          nameBadges={
                            isYou ? (
                              <StatusTagV2 tone="info" className="v2-role-badge">
                                {roleBadgeLabel({ isYou: true, rivalSlot: null })}
                              </StatusTagV2>
                            ) : isRival ? (
                              <StatusTagV2 tone="warning" className="v2-role-badge">
                                {roleBadgeLabel({ isYou: false, rivalSlot })}
                              </StatusTagV2>
                            ) : null
                          }
                          badges={(
                            <>
                              {shouldShowMomentumPill(movementDelta) ? (
                                <StatusTagV2 tone={movementTone(movementDelta)}>{movementLabel(movementDelta)}</StatusTagV2>
                              ) : null}
                              {entryBadges.map((badge) => (
                                <StatusTagV2
                                  key={`${entryKey}-${badge.kind}`}
                                  tone={socialBadgeTone(badge.kind)}
                                  title={badge.description}
                                >
                                  {badge.label}
                                </StatusTagV2>
                              ))}
                            </>
                          )}
                        />
                      </div>

                      <div className="text-lg font-semibold tabular-nums text-foreground">{entry.totalPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.exactPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.resultPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.knockoutPoints}</div>
                      <div className="tabular-nums text-sm font-medium text-foreground">{entry.bracketPoints}</div>
                    </div>

                    <div className="space-y-2 md:hidden">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-semibold tabular-nums text-foreground">{rankLabel(rank, tieCount)}</div>
                          <MemberIdentityRowV2
                            name={entry.member.name}
                            favoriteTeamCode={favoriteTeamCode}
                            avatarClassName="h-12 w-[72px]"
                            className="mt-1"
                            nameBadges={
                              isYou ? (
                                <StatusTagV2 tone="info" className="v2-role-badge">
                                  {roleBadgeLabel({ isYou: true, rivalSlot: null })}
                                </StatusTagV2>
                              ) : isRival ? (
                                <StatusTagV2 tone="warning" className="v2-role-badge">
                                  {roleBadgeLabel({ isYou: false, rivalSlot })}
                                </StatusTagV2>
                              ) : null
                            }
                          />
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-foreground">{entry.totalPoints}</div>
                          <div className="v2-type-kicker">Total</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        {shouldShowMomentumPill(movementDelta) ? (
                          <StatusTagV2 tone={movementTone(movementDelta)}>{movementLabel(movementDelta)}</StatusTagV2>
                        ) : null}
                        {entryBadges.map((badge) => (
                          <StatusTagV2
                            key={`${entryKey}-mobile-${badge.kind}`}
                            tone={socialBadgeTone(badge.kind)}
                            title={badge.description}
                          >
                            {badge.label}
                          </StatusTagV2>
                        ))}
                      </div>

                      <div className="v2-type-caption grid grid-cols-2 gap-1">
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Exact {entry.exactPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Outcome {entry.resultPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">KO {entry.knockoutPoints}</div>
                        <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Bracket {entry.bracketPoints}</div>
                      </div>
                    </div>
                  </RowShellV2>
                )
              })}
            </div>
          </div>

          {activeRows.length > LEADERBOARD_LIST_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="v2-type-caption">
                Showing {start + 1}-{Math.min(start + LEADERBOARD_LIST_PAGE_SIZE, activeRows.length)} of {activeRows.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="v2-action-compact"
                  disabled={safePage <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Prev
                </Button>
                <div className="v2-type-caption">
                  Page {safePage} / {totalPages}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="v2-action-compact"
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
          <div className="v2-semantic-surface v2-semantic-you rounded-xl border bg-background/95 p-3 shadow-[var(--shadow1)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="v2-type-kicker">Your row</div>
                <MemberIdentityRowV2
                  name={`${rankLabel(userContext.current.rank, stickyUserTieCount)} ${stickyUserRow.member.name}`}
                  favoriteTeamCode={stickyUserFavoriteTeamCode}
                  avatarClassName="h-12 w-[72px]"
                  className="mt-1"
                />
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted-foreground">{stickyUserRow.totalPoints} pts</span>
                </div>
              </div>
              <Button size="sm" variant="secondary" className="v2-action-compact" onClick={jumpToCurrentUserRow}>
                Jump to row
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShellV2>
  )
}
