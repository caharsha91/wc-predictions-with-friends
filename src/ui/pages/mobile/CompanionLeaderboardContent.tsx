import { useEffect, useMemo, useState } from 'react'

import type { DataMode } from '../../../lib/dataMode'
import type { LeaderboardEntry } from '../../../types/leaderboard'
import MemberIdentityRowV2 from '../../components/v2/MemberIdentityRowV2'
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
import {
  fetchRivalDirectory,
  readUserProfile,
  type RivalDirectoryEntry
} from '../../lib/profilePersistence'

const RIVAL_LIMIT = 3
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
  return `name:${normalizeKey(entry.member.name)}`
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeKey(viewerId)
  const seen = new Set<string>()
  const result: string[] = []

  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    const key = normalizeKey(trimmed)
    if (!trimmed || !key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
    if (result.length >= RIVAL_LIMIT) break
  }

  return result
}

function resolvePersistedRivalIds(
  profileRivals: string[],
  viewerId: string,
  directory: RivalDirectoryEntry[]
): string[] {
  const sanitized = sanitizeRivalUserIds(profileRivals, viewerId)
  const directoryMap = new Map<string, string>()

  for (const rival of directory) {
    const id = rival.id?.trim()
    if (!id) continue
    directoryMap.set(normalizeKey(id), id)
  }

  const result: string[] = []
  for (const rivalId of sanitized) {
    const canonical = directoryMap.get(normalizeKey(rivalId))
    if (!canonical) continue
    result.push(canonical)
    if (result.length >= RIVAL_LIMIT) break
  }

  return result
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

function movementTone(delta: number | null): 'success' | 'danger' | 'secondary' {
  if (delta === null || delta === 0) return 'secondary'
  return delta > 0 ? 'success' : 'danger'
}

function movementLabel(delta: number | null, unit: 'rank' | 'pts'): string {
  if (delta === null || delta === 0) return unit === 'rank' ? 'Rank =' : 'Pts ='
  if (unit === 'rank') return delta > 0 ? `Rank +${delta}` : `Rank -${Math.abs(delta)}`
  return delta > 0 ? `Pts +${delta}` : `Pts ${delta}`
}

function rankLabel(rank: number, tieCount: number): string {
  if (tieCount > 1) return `T#${rank}`
  return `#${rank}`
}

function CompactMessage({ children }: { children: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{children}</div>
}

function BreakdownChips({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="v2-type-caption grid grid-cols-2 gap-1">
      <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Exact {entry.exactPoints}</div>
      <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Outcome {entry.resultPoints}</div>
      <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">KO {entry.knockoutPoints}</div>
      <div className="rounded-full border border-border/70 bg-background/45 px-2 py-1 tabular-nums">Bracket {entry.bracketPoints}</div>
    </div>
  )
}

function StandingRow({ row }: { row: RankedRow }) {
  return (
    <RowShellV2
      key={`league-row-${entryIdentityKey(row.entry)}`}
      depth={row.isViewer ? 'prominent' : 'embedded'}
      state={row.isViewer ? 'you' : row.rivalSlot ? 'rival' : 'default'}
      className="px-3 py-3"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold tabular-nums text-foreground">{rankLabel(row.rank, row.tieCount)}</div>
            <MemberIdentityRowV2
              name={row.entry.member.name}
              favoriteTeamCode={row.entry.member.favoriteTeamCode ?? null}
              avatarClassName="h-12 w-[72px]"
              className="mt-1"
              nameBadges={
                row.isViewer ? (
                  <StatusTagV2 tone="you">You</StatusTagV2>
                ) : row.rivalSlot ? (
                  <StatusTagV2 tone="rival">Rival {row.rivalSlot}</StatusTagV2>
                ) : null
              }
            />
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums text-foreground">{row.points}</div>
            <div className="v2-type-kicker">Total</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <StatusTagV2 tone={movementTone(row.rankDelta)}>{movementLabel(row.rankDelta, 'rank')}</StatusTagV2>
          <StatusTagV2 tone={movementTone(row.pointsDelta)}>{movementLabel(row.pointsDelta, 'pts')}</StatusTagV2>
        </div>

        <BreakdownChips entry={row.entry} />
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

        const persisted = resolvePersistedRivalIds(profile.rivalUserIds, viewerId, directory)

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

  const previousSnapshot = useMemo(() => readRankSnapshot(mode), [mode])

  const rivalPriorityMap = useMemo(() => {
    const map = new Map<string, number>()
    profileState.rivalUserIds.forEach((id, index) => {
      const normalized = normalizeKey(id)
      if (!normalized) return
      map.set(normalized, index + 1)
      map.set(`id:${normalized}`, index + 1)
      map.set(`name:${normalized}`, index + 1)
      map.set(`email:${normalized}`, index + 1)
    })
    return map
  }, [profileState.rivalUserIds])

  const rankedRows = useMemo(() => {
    const sorted = [...presentationRows].sort((left, right) => {
      if (right.totalPoints !== left.totalPoints) return right.totalPoints - left.totalPoints

      const leftViewer = resolveLeaderboardIdentityKeys(left).some((key) => viewerKeys.has(normalizeKey(key)))
      const rightViewer = resolveLeaderboardIdentityKeys(right).some((key) => viewerKeys.has(normalizeKey(key)))
      if (leftViewer !== rightViewer) return leftViewer ? -1 : 1

      const leftPriority = Math.min(
        ...resolveLeaderboardIdentityKeys(left)
          .map((key) => rivalPriorityMap.get(normalizeKey(key)) ?? Number.POSITIVE_INFINITY)
      )
      const rightPriority = Math.min(
        ...resolveLeaderboardIdentityKeys(right)
          .map((key) => rivalPriorityMap.get(normalizeKey(key)) ?? Number.POSITIVE_INFINITY)
      )
      if (leftPriority !== rightPriority) return leftPriority - rightPriority

      return left.member.name.localeCompare(right.member.name)
    })

    const rows: RankedRow[] = []
    let previousPoints: number | null = null
    let currentRank = 0

    for (let index = 0; index < sorted.length; index += 1) {
      const entry = sorted[index]
      const points = Number.isFinite(entry.totalPoints) ? entry.totalPoints : 0
      if (previousPoints === null || points !== previousPoints) {
        currentRank = index + 1
        previousPoints = points
      }

      const identityKey = entryIdentityKey(entry)
      const previousRank = previousSnapshot?.ranks[identityKey]
      const previousPointsValue = previousSnapshot?.points[identityKey]

      const identities = resolveLeaderboardIdentityKeys(entry)
      const isViewer = identities.some((key) => viewerKeys.has(normalizeKey(key)))

      let rivalSlot: number | null = null
      for (const key of identities) {
        const resolved = rivalPriorityMap.get(normalizeKey(key))
        if (typeof resolved === 'number') {
          rivalSlot = resolved
          break
        }
      }

      rows.push({
        entry,
        rank: currentRank,
        tieCount: 1,
        points,
        rankDelta: typeof previousRank === 'number' ? previousRank - currentRank : null,
        pointsDelta:
          typeof previousPointsValue === 'number' ? points - previousPointsValue : null,
        isViewer,
        rivalSlot
      })
    }

    const tieCountByRank = new Map<number, number>()
    for (const row of rows) {
      tieCountByRank.set(row.rank, (tieCountByRank.get(row.rank) ?? 0) + 1)
    }

    return rows.map((row) => ({ ...row, tieCount: tieCountByRank.get(row.rank) ?? 1 }))
  }, [presentationRows, previousSnapshot?.points, previousSnapshot?.ranks, rivalPriorityMap, viewerKeys])

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
    const rows: RankedRow[] = []

    for (const rivalId of profileState.rivalUserIds) {
      const normalized = normalizeKey(rivalId)
      const row = rankedRows.find((candidate) =>
        resolveLeaderboardIdentityKeys(candidate.entry).some(
          (key) => normalizeKey(key) === normalized || normalizeKey(key) === `id:${normalized}`
        )
      )
      if (!row) continue
      if (!rows.some((candidate) => entryIdentityKey(candidate.entry) === entryIdentityKey(row.entry))) {
        rows.push(row)
      }
    }

    return rows
  }, [profileState.rivalUserIds, rankedRows])

  const leaderboardRows = useMemo(() => {
    if (rankedRows.length <= 12) return rankedRows

    const selected: RankedRow[] = []
    const seen = new Set<string>()

    const add = (row: RankedRow | undefined) => {
      if (!row) return
      const key = entryIdentityKey(row.entry)
      if (seen.has(key)) return
      seen.add(key)
      selected.push(row)
    }

    rankedRows.slice(0, 8).forEach(add)
    add(viewerRow ?? undefined)
    rivalRows.forEach(add)

    for (const row of rankedRows) {
      if (selected.length >= 12) break
      add(row)
    }

    return selected.sort((left, right) => left.rank - right.rank)
  }, [rankedRows, rivalRows, viewerRow])

  return (
    <>
      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">You</div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot: " />
            <span>{rankedRows.length} ranked</span>
          </div>
        </div>

        {snapshot.state.status === 'error' ? (
          <CompactMessage>{snapshot.state.message}</CompactMessage>
        ) : !viewerRow ? (
          <CompactMessage>Your row is not available in the latest snapshot.</CompactMessage>
        ) : (
          <StandingRow row={viewerRow} />
        )}
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Rivals</div>
          <StatusTagV2 tone={rivalRows.length > 0 ? 'info' : 'secondary'}>{rivalRows.length}/{RIVAL_LIMIT}</StatusTagV2>
        </div>

        {profileState.message ? <CompactMessage>{profileState.message}</CompactMessage> : null}

        {profileState.status === 'loading' ? (
          <CompactMessage>Loading saved rivals…</CompactMessage>
        ) : profileState.rivalUserIds.length === 0 ? (
          <CompactMessage>No saved rivals. Manage rivals on web.</CompactMessage>
        ) : rivalRows.length === 0 ? (
          <CompactMessage>Saved rivals are not present in this snapshot.</CompactMessage>
        ) : (
          <div className="space-y-2">
            {rivalRows.map((row) => (
              <StandingRow key={`rival-row-${entryIdentityKey(row.entry)}`} row={row} />
            ))}
          </div>
        )}
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Leaderboard</div>
          {snapshot.state.status === 'loading' ? <StatusTagV2 tone="info">Loading</StatusTagV2> : null}
        </div>

        {snapshot.state.status === 'error' ? (
          <CompactMessage>{snapshot.state.message}</CompactMessage>
        ) : leaderboardRows.length === 0 ? (
          <CompactMessage>No standings available.</CompactMessage>
        ) : (
          <div className="space-y-2">
            {leaderboardRows.map((row) => (
              <StandingRow key={`leaderboard-row-${entryIdentityKey(row.entry)}`} row={row} />
            ))}
          </div>
        )}
      </SectionCardV2>
    </>
  )
}
