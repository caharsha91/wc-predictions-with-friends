import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { DataMode } from '../../../lib/dataMode'
import type { LeaderboardEntry } from '../../../types/leaderboard'
import MemberAvatarV2 from '../../components/v2/MemberAvatarV2'
import RowShellV2 from '../../components/v2/RowShellV2'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import SnapshotStamp from '../../components/v2/SnapshotStamp'
import StatusTagV2 from '../../components/v2/StatusTagV2'
import { useAuthState } from '../../hooks/useAuthState'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { usePublishedSnapshot } from '../../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { useViewerId } from '../../hooks/useViewerId'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys } from '../../lib/leaderboardContext'
import { buildLeaderboardPresentation } from '../../lib/leaderboardPresentation'
import { rankRowsWithTiePriority } from '../../lib/leaderboardTieRanking'
import {
  buildRivalComparisonIdentities,
  buildRivalSlotLookup,
  resolveCanonicalRivalIds
} from '../../lib/rivalIdentity'
import {
  fetchRivalDirectory,
  readUserProfile,
  type RivalDirectoryEntry
} from '../../lib/profilePersistence'

const RIVAL_LIMIT = 3
const TOP_LEADERBOARD_LIMIT = 10
const MOMENTUM_SNAPSHOT_KEY = 'wc-companion-leaderboard-snapshot'

type RankSnapshot = {
  snapshotTimestamp: string
  ranks: Record<string, number>
  points: Record<string, number>
}

type ProfileState = {
  status: 'loading' | 'ready' | 'error'
  rivalUserIds: string[]
  rivalDirectory: RivalDirectoryEntry[]
  message: string | null
}

type RankedRow = {
  entry: LeaderboardEntry
  rank: number
  tieCount: number
  points: number
  rankDelta: number | null
  pointsDelta: number | null
  isViewer: boolean
  rivalSlot: number | null
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function entryIdentityKey(entry: LeaderboardEntry): string {
  const memberId = normalizeKey(entry.member.id)
  if (memberId) return `id:${memberId}`
  const memberEmail = normalizeKey(entry.member.email)
  if (memberEmail) return `email:${memberEmail}`
  return `name:${normalizeKey(entry.member.name)}`
}

function readRankSnapshot(mode: DataMode): RankSnapshot | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(`${MOMENTUM_SNAPSHOT_KEY}:${mode}`)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as {
      snapshotTimestamp?: unknown
      ranks?: unknown
      points?: unknown
    }

    if (typeof parsed.snapshotTimestamp !== 'string') return null
    if (!parsed.ranks || typeof parsed.ranks !== 'object' || Array.isArray(parsed.ranks)) return null
    if (!parsed.points || typeof parsed.points !== 'object' || Array.isArray(parsed.points)) return null

    const ranks = Object.fromEntries(
      Object.entries(parsed.ranks).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    ) as Record<string, number>
    const points = Object.fromEntries(
      Object.entries(parsed.points).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    ) as Record<string, number>

    return {
      snapshotTimestamp: parsed.snapshotTimestamp,
      ranks,
      points
    }
  } catch {
    return null
  }
}

function writeRankSnapshot(mode: DataMode, snapshot: RankSnapshot) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`${MOMENTUM_SNAPSHOT_KEY}:${mode}`, JSON.stringify(snapshot))
}

function rankLabel(rank: number, tieCount: number): string {
  if (tieCount > 1) return `T#${rank}`
  return `#${rank}`
}

function CompactMessage({ children }: { children: string }) {
  return (
    <div className="companion-league-message rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function BreakdownIcon({ children }: { children: ReactNode }) {
  return (
    <span className="companion-league-breakdown-icon inline-flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
      {children}
    </span>
  )
}

function ExactIcon() {
  return (
    <BreakdownIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    </BreakdownIcon>
  )
}

function OutcomeIcon() {
  return (
    <BreakdownIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.4 2.4 4.6-4.8" />
      </svg>
    </BreakdownIcon>
  )
}

function KnockoutIcon() {
  return (
    <BreakdownIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5v5l3 2 3-2V5" />
        <path d="M18 5v5l-3 2-3-2V5" />
        <path d="M12 12v5" />
        <path d="M9 19h6" />
      </svg>
    </BreakdownIcon>
  )
}

function BracketPointsIcon() {
  return (
    <BreakdownIcon>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 5v14M17 5v14" />
        <path d="M7 8h4M13 8h4" />
        <path d="M7 16h4M13 16h4" />
      </svg>
    </BreakdownIcon>
  )
}

function BreakdownChips({ entry }: { entry: LeaderboardEntry }) {
  const metrics = [
    { label: 'Exact', value: entry.exactPoints, icon: <ExactIcon /> },
    { label: 'Outcome', value: entry.resultPoints, icon: <OutcomeIcon /> },
    { label: 'Knockout', value: entry.knockoutPoints, icon: <KnockoutIcon /> },
    { label: 'Bracket', value: entry.bracketPoints, icon: <BracketPointsIcon /> }
  ]

  return (
    <div className="companion-league-breakdown v2-type-caption grid grid-cols-4 gap-1">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="companion-league-breakdown-chip rounded-full border border-border/70 bg-background/45 px-2 py-1 text-center tabular-nums"
          aria-label={`${metric.label} ${metric.value}`}
        >
          <div className="flex items-center justify-center gap-1">
            {metric.icon}
            <span className="companion-league-breakdown-value">{metric.value}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function FeedHeading({ label, right }: { label: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <div className="v2-type-kicker">{label}</div>
      {right ? <div className="v2-type-caption">{right}</div> : null}
    </div>
  )
}

function CompactStandingRow({ row, showBreakdown }: { row: RankedRow; showBreakdown: boolean }) {
  return (
    <RowShellV2
      depth={row.isViewer ? 'prominent' : 'embedded'}
      state={row.isViewer ? 'you' : row.rivalSlot ? 'rival' : 'default'}
      className="companion-league-row px-2.5 py-2"
    >
      <div className="space-y-1.5">
        <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
          <div className="text-sm font-semibold tabular-nums text-foreground">{rankLabel(row.rank, row.tieCount)}</div>
          <div className="min-w-0 flex items-center gap-2">
            <MemberAvatarV2
              name={row.entry.member.name}
              favoriteTeamCode={row.entry.member.favoriteTeamCode ?? null}
              size="sm"
              className="h-8 w-12 rounded-md"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-sm font-semibold text-foreground">{row.entry.member.name}</div>
                {row.isViewer ? (
                  <StatusTagV2 tone="you" className="companion-league-role-tag">
                    You
                  </StatusTagV2>
                ) : row.rivalSlot ? (
                  <StatusTagV2 tone="rival" className="companion-league-role-tag">
                    Rival {row.rivalSlot}
                  </StatusTagV2>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-semibold tabular-nums text-foreground">{row.points}</div>
            <div className="v2-type-kicker">pts</div>
          </div>
        </div>

        {showBreakdown ? <BreakdownChips entry={row.entry} /> : null}
      </div>
    </RowShellV2>
  )
}

export default function CompanionLeaderboardContent() {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const viewerId = useViewerId()
  const mode = useRouteDataMode()
  const snapshot = usePublishedSnapshot()

  const [profileState, setProfileState] = useState<ProfileState>({
    status: 'loading',
    rivalUserIds: [],
    rivalDirectory: [],
    message: null
  })

  const memberId = (currentUser?.id ?? viewerId).trim()

  useEffect(() => {
    let canceled = false

    async function loadProfileAndDirectory() {
      if (!memberId) {
        setProfileState({
          status: 'ready',
          rivalUserIds: [],
          rivalDirectory: [],
          message: null
        })
        return
      }

      setProfileState((current) => ({ ...current, status: 'loading', message: null }))

      try {
        const [profile, directory] = await Promise.all([
          readUserProfile(mode, memberId, authState.user?.email ?? null),
          fetchRivalDirectory(mode, memberId, authState.user?.email ?? null)
        ])

        if (canceled) return

        const persisted = resolveCanonicalRivalIds(profile.rivalUserIds, viewerId, directory)
        setProfileState({
          status: 'ready',
          rivalUserIds: persisted,
          rivalDirectory: directory,
          message: null
        })
      } catch (error) {
        if (canceled) return
        setProfileState({
          status: 'error',
          rivalUserIds: [],
          rivalDirectory: [],
          message: error instanceof Error ? error.message : 'Unable to load rivalry data.'
        })
      }
    }

    void loadProfileAndDirectory()

    return () => {
      canceled = true
    }
  }, [authState.user?.email, memberId, mode, viewerId])

  const presentationRows = useMemo(() => {
    if (snapshot.state.status !== 'ready') return [] as LeaderboardEntry[]
    return buildLeaderboardPresentation({
      snapshotTimestamp: snapshot.state.snapshotTimestamp,
      groupStageComplete: snapshot.state.groupStageComplete,
      projectedGroupStagePointsByUser: snapshot.state.projectedGroupStagePointsByUser,
      leaderboardRows: snapshot.state.leaderboardRows
    }).rows
  }, [snapshot.state])

  const viewerKeys = useMemo(
    () =>
      buildViewerKeySet([
        viewerId,
        currentUser?.id ?? null,
        currentUser?.email ?? null,
        currentUser?.name ?? null
      ]),
    [currentUser?.email, currentUser?.id, currentUser?.name, viewerId]
  )

  const rivalComparisonIdentities = useMemo(
    () => buildRivalComparisonIdentities(profileState.rivalUserIds, profileState.rivalDirectory),
    [profileState.rivalDirectory, profileState.rivalUserIds]
  )

  const rivalSlotLookup = useMemo(
    () => buildRivalSlotLookup(profileState.rivalUserIds, profileState.rivalDirectory),
    [profileState.rivalDirectory, profileState.rivalUserIds]
  )

  const tieRanked = useMemo(
    () =>
      rankRowsWithTiePriority({
        rows: presentationRows,
        getPoints: (entry) => entry.totalPoints,
        getIdentityKeys: (entry) => resolveLeaderboardIdentityKeys(entry),
        getName: (entry) => entry.member.name,
        viewerIdentity: viewerId,
        rivalIdentities: rivalComparisonIdentities
      }),
    [presentationRows, rivalComparisonIdentities, viewerId]
  )

  const sortedRows = tieRanked.sortedRows

  const rankByEntryKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const { row, rank } of tieRanked.rankedRows) {
      map.set(entryIdentityKey(row), rank)
    }
    return map
  }, [tieRanked.rankedRows])

  const tieCountByEntryKey = useMemo(() => {
    const tieCountByPoints = new Map<number, number>()
    const tieCountByKey = new Map<string, number>()
    for (const entry of sortedRows) {
      tieCountByPoints.set(entry.totalPoints, (tieCountByPoints.get(entry.totalPoints) ?? 0) + 1)
    }
    for (const entry of sortedRows) {
      tieCountByKey.set(entryIdentityKey(entry), tieCountByPoints.get(entry.totalPoints) ?? 1)
    }
    return tieCountByKey
  }, [sortedRows])

  const previousSnapshot = useMemo(() => readRankSnapshot(mode), [mode])

  const rankedRows = useMemo(() => {
    return sortedRows.map((entry, index) => {
      const key = entryIdentityKey(entry)
      const rank = rankByEntryKey.get(key) ?? index + 1
      const points = Number.isFinite(entry.totalPoints) ? entry.totalPoints : 0
      const previousRank = previousSnapshot?.ranks[key]
      const previousPointsValue = previousSnapshot?.points[key]
      const isViewer = resolveLeaderboardIdentityKeys(entry).some((identity) => viewerKeys.has(normalizeKey(identity)))

      let rivalSlot: number | null = null
      for (const identity of resolveLeaderboardIdentityKeys(entry)) {
        const slot = rivalSlotLookup.get(normalizeKey(identity))
        if (typeof slot === 'number') {
          rivalSlot = slot
          break
        }
      }

      return {
        entry,
        rank,
        tieCount: tieCountByEntryKey.get(key) ?? 1,
        points,
        rankDelta: typeof previousRank === 'number' ? previousRank - rank : null,
        pointsDelta: typeof previousPointsValue === 'number' ? points - previousPointsValue : null,
        isViewer,
        rivalSlot
      } satisfies RankedRow
    })
  }, [previousSnapshot?.points, previousSnapshot?.ranks, rankByEntryKey, rivalSlotLookup, sortedRows, tieCountByEntryKey, viewerKeys])

  const snapshotTimestamp = snapshot.state.status === 'ready' ? snapshot.state.snapshotTimestamp : null

  useEffect(() => {
    if (!snapshotTimestamp || rankedRows.length === 0) return
    const ranks: Record<string, number> = {}
    const points: Record<string, number> = {}

    for (const row of rankedRows) {
      const key = entryIdentityKey(row.entry)
      ranks[key] = row.rank
      points[key] = row.points
    }

    writeRankSnapshot(mode, {
      snapshotTimestamp,
      ranks,
      points
    })
  }, [mode, rankedRows, snapshotTimestamp])

  const viewerRow = useMemo(() => rankedRows.find((row) => row.isViewer) ?? null, [rankedRows])

  const rivalRows = useMemo(() => {
    return rankedRows
      .filter((row) => row.rivalSlot !== null)
      .sort((left, right) => (left.rivalSlot ?? 99) - (right.rivalSlot ?? 99))
  }, [rankedRows])

  const topWindowRows = useMemo(() => {
    const selected: RankedRow[] = []
    const seen = new Set<string>()

    const add = (row: RankedRow | null | undefined) => {
      if (!row) return
      const key = entryIdentityKey(row.entry)
      if (seen.has(key)) return
      seen.add(key)
      selected.push(row)
    }

    rankedRows.slice(0, TOP_LEADERBOARD_LIMIT).forEach(add)
    add(viewerRow)
    rivalRows.forEach(add)

    return selected.sort((left, right) => left.rank - right.rank)
  }, [rankedRows, rivalRows, viewerRow])

  return (
    <SectionCardV2 tone="panel" density="none" withGlow={false} className="companion-league-panel space-y-3 p-3.5">
      <div className="companion-league-header flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="v2-type-kicker">Updated</div>
          <div className="text-sm text-muted-foreground">
            <SnapshotStamp timestamp={snapshotTimestamp} prefix="" />
          </div>
        </div>
        <div className="companion-league-header-tags flex items-center gap-1.5">
          <StatusTagV2 tone="secondary">{`${rankedRows.length} ranked`}</StatusTagV2>
          <StatusTagV2 tone="rival">{`Rivals ${profileState.rivalUserIds.length}/${RIVAL_LIMIT}`}</StatusTagV2>
          {snapshot.state.status === 'loading' ? <StatusTagV2 tone="info">Syncing</StatusTagV2> : null}
        </div>
      </div>

      {profileState.message ? <CompactMessage>{profileState.message}</CompactMessage> : null}
      {snapshot.state.status === 'error' ? <CompactMessage>{snapshot.state.message}</CompactMessage> : null}

      <SectionCardV2 tone="inset" density="none" withGlow={false} className="companion-league-inset space-y-2 p-2.5">
        <FeedHeading label="Leaderboard" right={`Top ${TOP_LEADERBOARD_LIMIT} + your row + rivals`} />
        {topWindowRows.length === 0 ? (
          <CompactMessage>No standings yet. They will appear after the next update.</CompactMessage>
        ) : (
          <div className="space-y-1.5">
            {topWindowRows.map((row) => (
              <CompactStandingRow
                key={`league-${entryIdentityKey(row.entry)}`}
                row={row}
                showBreakdown={row.isViewer || row.rivalSlot !== null}
              />
            ))}
          </div>
        )}
      </SectionCardV2>
    </SectionCardV2>
  )
}
