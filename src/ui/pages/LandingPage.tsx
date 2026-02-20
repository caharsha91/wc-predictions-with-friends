import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete } from '../../lib/picks'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  BracketIcon,
  CalendarIcon,
  ResultsIcon,
  TrophyIcon
} from '../components/Icons'
import LeaderboardPodium, { type LeaderboardPodiumRow } from '../components/v2/LeaderboardPodium'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import ProfileAvatar from '../components/v2/ProfileAvatar'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import V2Card from '../components/v2/V2Card'
import { useAuthState } from '../hooks/useAuthState'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDemoScenarioState } from '../hooks/useDemoScenarioState'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { resolveKnockoutActivation } from '../lib/knockoutActivation'
import { validateLastRoute } from '../lib/lastRoute'
import {
  fetchRivalDirectory,
  readUserProfile,
  writeUserProfile,
  type RivalDirectoryEntry
} from '../lib/profilePersistence'
import { cn } from '../lib/utils'

type EntryTileKey = 'group-stage' | 'match-picks' | 'knockout-bracket' | 'leaderboard'
type PillTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'locked'

type EntryTile = {
  key: EntryTileKey
  label: string
  description: string
  icon: (props: { size?: number }) => JSX.Element
}

type TileProgressPill = {
  label: string
  tone: PillTone
}

type SnapshotRow = {
  id: string
  name: string
  photoURL: string | null
  rank: number | null
  points: number | null
  isViewer: boolean
}

type QueueMatch = {
  match: Match
  lockTime: Date
  locked: boolean
  complete: boolean
}

const ENTRY_TILES: EntryTile[] = [
  {
    key: 'group-stage',
    label: 'Group Stage',
    description: 'Set your group winners and best-third qualifiers.',
    icon: CalendarIcon
  },
  {
    key: 'match-picks',
    label: 'Match Picks',
    description: 'Make your next score picks before lock.',
    icon: ResultsIcon
  },
  {
    key: 'knockout-bracket',
    label: 'Knockout Bracket',
    description: 'Lock your knockout path round by round.',
    icon: BracketIcon
  },
  {
    key: 'leaderboard',
    label: 'Main Leaderboard',
    description: 'See where you stand in the latest snapshot.',
    icon: TrophyIcon
  }
]

function normalizeRivalUserIds(nextRivals: string[]): string[] {
  const ordered = new Set<string>()
  for (const rivalId of nextRivals) {
    const normalized = rivalId.trim()
    if (!normalized) continue
    ordered.add(normalized)
    if (ordered.size >= 3) break
  }
  return [...ordered]
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeStatus(status: Match['status'] | string): string {
  return String(status || '').toUpperCase()
}

function isResolvedTeamCode(code?: string): boolean {
  const normalized = (code ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(normalized)
}

function resolveSnapshotRow(
  id: string,
  leaderboardById: Map<string, { entry: LeaderboardEntry; rank: number }>,
  fallbackName: string,
  photoURL: string | null,
  isViewer: boolean
): SnapshotRow {
  const match = leaderboardById.get(normalizeKey(id))
  return {
    id,
    name: match?.entry.member.name ?? fallbackName,
    photoURL,
    rank: match?.rank ?? null,
    points: typeof match?.entry.totalPoints === 'number' ? match.entry.totalPoints : null,
    isViewer
  }
}

function SnapshotTable({ rows }: { rows: SnapshotRow[] }) {
  return (
    <div className="landing-v2-standings-list overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[minmax(0,1fr)_64px_56px] gap-2 border-b border-border/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <div>Player</div>
        <div className="text-right">Rank</div>
        <div className="text-right">Pts</div>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map((row, index) => (
          <div
            key={`${row.id}-${index}`}
            className={cn(
              'landing-v2-standings-row grid grid-cols-[minmax(0,1fr)_64px_56px] items-center gap-2 px-3 py-2',
              row.isViewer && 'landing-v2-standings-row-viewer'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <ProfileAvatar name={row.name} photoURL={row.photoURL} className="h-7 w-7" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[color:var(--v2-text-strong)]">{row.name}</div>
                {row.isViewer ? <div className="text-[11px] text-muted-foreground">You</div> : null}
              </div>
            </div>
            <div className="text-right text-xs font-semibold text-[color:var(--v2-text-strong)]">
              {row.rank ? `#${row.rank}` : '—'}
            </div>
            <div className="text-right text-xs font-semibold text-[color:var(--v2-text-strong)]">
              {row.points ?? '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TileProgressPills({ pills }: { pills: TileProgressPill[] }) {
  return (
    <div className="landing-v2-card-pills">
      {pills.map((pill) => (
        <Badge
          key={pill.label}
          tone={pill.tone}
          className="landing-v2-progress-pill"
          data-tone={pill.tone}
        >
          {pill.label}
        </Badge>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const currentUser = useCurrentUser()
  const authState = useAuthState()
  const now = useNow({ tickMs: 60_000 })
  const publishedSnapshot = usePublishedSnapshot()
  const picksState = usePicksData()
  const demoScenario = useDemoScenarioState()

  const [lastRoute, setLastRoute] = useState<string | null>(null)
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const [isRivalsEditing, setIsRivalsEditing] = useState(false)
  const [rivalQuery, setRivalQuery] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [rivalsReloadCount, setRivalsReloadCount] = useState(0)
  const [rivalsState, setRivalsState] = useState<
    { status: 'loading' } | { status: 'ready'; entries: RivalDirectoryEntry[] } | { status: 'error'; message: string }
  >({ status: 'loading' })

  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingPersistCountRef = useRef(0)

  const isDemoMode = mode === 'demo'
  const routePrefix = isDemoMode ? '/demo' : ''
  const landingPath = isDemoMode ? '/demo' : '/'
  const memberId = viewerId

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)
  const knockoutData = useBracketKnockoutData()

  useEffect(() => {
    let canceled = false

    async function loadProfile() {
      setProfileLoading(true)
      try {
        const profile = await readUserProfile(mode, memberId, authState.user?.email ?? null)
        if (canceled) return
        setLastRoute(profile.lastRoute)
        setRivalUserIds(profile.rivalUserIds)
      } catch {
        if (canceled) return
        setLastRoute(null)
        setRivalUserIds([])
      } finally {
        if (!canceled) setProfileLoading(false)
      }
    }

    void loadProfile()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, memberId, mode])

  useEffect(() => {
    let canceled = false

    async function loadRivalDirectory() {
      setRivalsState({ status: 'loading' })
      try {
        const entries = await fetchRivalDirectory(mode, memberId, authState.user?.email ?? null)
        if (canceled) return
        setRivalsState({ status: 'ready', entries })
      } catch (error) {
        if (canceled) return
        const message = error instanceof Error ? error.message : 'Unable to load rivals.'
        setRivalsState({ status: 'error', message })
      }
    }

    void loadRivalDirectory()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, memberId, mode, rivalsReloadCount])

  useEffect(() => {
    if (!isRivalsEditing) setRivalQuery('')
  }, [isRivalsEditing])

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const snapshotTimestamp = snapshotReady?.snapshotTimestamp ?? null

  const viewerName = currentUser?.name || authState.user?.displayName || authState.user?.email || 'You'
  const viewerPhotoURL = authState.user?.photoURL ?? null

  const leaderboardById = useMemo(() => {
    const lookup = new Map<string, { entry: LeaderboardEntry; rank: number }>()
    if (!snapshotReady) return lookup
    for (let index = 0; index < snapshotReady.leaderboardRows.length; index += 1) {
      const row = snapshotReady.leaderboardRows[index]
      const key = normalizeKey(row.member.id)
      if (!key) continue
      lookup.set(key, { entry: row, rank: index + 1 })
    }
    return lookup
  }, [snapshotReady])

  const rivalMap = useMemo(() => {
    if (rivalsState.status !== 'ready') return new Map<string, RivalDirectoryEntry>()
    return new Map(rivalsState.entries.map((entry) => [entry.id, entry]))
  }, [rivalsState])

  const selectedRivalEntries = useMemo(
    () =>
      rivalUserIds.map((rivalId) => {
        const rival = rivalMap.get(rivalId)
        return {
          id: rivalId,
          displayName: rival?.displayName ?? rivalId,
          photoURL: rival?.photoURL ?? null
        }
      }),
    [rivalMap, rivalUserIds]
  )

  const filteredRivalSuggestions = useMemo(() => {
    if (rivalsState.status !== 'ready') return []
    const selected = new Set(rivalUserIds)
    const query = rivalQuery.trim().toLowerCase()
    return rivalsState.entries
      .filter((entry) => !selected.has(entry.id))
      .filter((entry) => (query ? entry.displayName.toLowerCase().includes(query) : true))
  }, [rivalQuery, rivalUserIds, rivalsState])

  const selectedSnapshotRows = useMemo(() => {
    if (rivalUserIds.length === 0) return []
    const ordered = normalizeRivalUserIds([viewerId, ...rivalUserIds]).slice(0, 4)
    return ordered.map((id) => {
      const rival = rivalMap.get(id)
      return resolveSnapshotRow(
        id,
        leaderboardById,
        id === viewerId ? viewerName : rival?.displayName ?? id,
        id === viewerId ? viewerPhotoURL : (rival?.photoURL ?? null),
        id === viewerId
      )
    })
  }, [leaderboardById, rivalMap, rivalUserIds, viewerId, viewerName, viewerPhotoURL])

  const podiumRows = useMemo(() => {
    if (!snapshotReady) return []
    return snapshotReady.leaderboardRows.slice(0, 3).map((entry, index) => {
      const rank = (index + 1) as 1 | 2 | 3
      const rowId = entry.member.id || `podium-${rank}`
      const isViewer = normalizeKey(rowId) === normalizeKey(viewerId)
      const photoURL = isViewer ? viewerPhotoURL : (rivalMap.get(rowId)?.photoURL ?? null)

      return {
        id: rowId,
        name: entry.member.name,
        points: entry.totalPoints,
        rank,
        photoURL,
        isViewer
      } satisfies LeaderboardPodiumRow
    })
  }, [snapshotReady, rivalMap, viewerId, viewerPhotoURL])

  const viewerSnapshotRow = useMemo(() => {
    return resolveSnapshotRow(viewerId, leaderboardById, viewerName, viewerPhotoURL, true)
  }, [leaderboardById, viewerId, viewerName, viewerPhotoURL])

  const topThreePlusViewerRows = useMemo(
    () => [
      ...podiumRows.map((row) => ({
        id: row.id,
        name: row.name,
        photoURL: row.photoURL ?? null,
        rank: row.rank,
        points: row.points,
        isViewer: row.isViewer === true
      })),
      viewerSnapshotRow
    ],
    [podiumRows, viewerSnapshotRow]
  )

  const standingsRows = rivalUserIds.length > 0 ? selectedSnapshotRows : topThreePlusViewerRows
  const standingsTitle = rivalUserIds.length > 0 ? `Rivals (${rivalUserIds.length}/3)` : 'Top 3 + You'

  const groupCompletion = useMemo(() => {
    let groupsDone = 0
    for (const groupId of groupStage.groupIds) {
      const selection = groupStage.data.groups[groupId] ?? {}
      if (selection.first && selection.second && selection.first !== selection.second) {
        groupsDone += 1
      }
    }
    const bestThirdDone = Math.min(8, groupStage.data.bestThirds.filter(Boolean).length)
    const groupsTotal = groupStage.groupIds.length
    const groupsRemaining = Math.max(0, groupsTotal - groupsDone)
    const bestThirdRemaining = Math.max(0, 8 - bestThirdDone)
    return {
      groupsDone,
      groupsTotal,
      bestThirdDone,
      pending: groupsRemaining + bestThirdRemaining
    }
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds])

  const queueMatches = useMemo<QueueMatch[]>(() => {
    return matches
      .filter((match) => normalizeStatus(match.status) !== 'FINISHED')
      .map((match) => {
        const pick = findPick(picksState.picks, match.id, viewerId)
        const lockTime = getLockTime(match.kickoffUtc)
        return {
          match,
          lockTime,
          locked: isMatchLocked(match.kickoffUtc, now),
          complete: isPickComplete(match, pick)
        }
      })
      .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())
  }, [matches, now, picksState.picks, viewerId])

  const matchWindow48h = useMemo(() => {
    const nowMs = now.getTime()
    const windowEndMs = nowMs + 48 * 60 * 60 * 1000
    const entries = queueMatches.filter((entry) => {
      const lockMs = entry.lockTime.getTime()
      return !entry.locked && lockMs >= nowMs && lockMs <= windowEndMs
    })
    const total = entries.length
    const picked = entries.filter((entry) => entry.complete).length
    return {
      total,
      picked,
      pending: Math.max(0, total - picked)
    }
  }, [now, queueMatches])

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

  const knockoutActivation = useMemo(
    () =>
      resolveKnockoutActivation({
        mode,
        demoScenario,
        groupComplete: groupCompleteFromMatches || groupClosed,
        drawReady: knockoutDrawReady,
        knockoutStarted
      }),
    [demoScenario, groupClosed, groupCompleteFromMatches, knockoutDrawReady, knockoutStarted, mode]
  )

  const tilePillsByKey = useMemo<Record<EntryTileKey, TileProgressPill[]>>(() => {
    const groupLoading = groupStage.loadState.status === 'loading'
    const knockoutLoading = knockoutData.loadState.status === 'loading'
    const picksLoading = picksState.state.status === 'loading'

    const groupPills: TileProgressPill[] = groupLoading
      ? [{ label: 'Updating', tone: 'secondary' }]
      : [
          {
            label: `Groups ${groupCompletion.groupsDone}/${groupCompletion.groupsTotal}`,
            tone: groupCompletion.groupsDone === groupCompletion.groupsTotal && groupCompletion.groupsTotal > 0 ? 'success' : 'warning'
          },
          {
            label: `Best thirds ${groupCompletion.bestThirdDone}/8`,
            tone: groupCompletion.bestThirdDone === 8 ? 'success' : 'warning'
          },
          {
            label: `Pending ${groupCompletion.pending}`,
            tone: groupCompletion.pending === 0 ? 'success' : 'warning'
          }
        ]

    const matchPills: TileProgressPill[] = picksLoading
      ? [{ label: 'Updating', tone: 'secondary' }]
      : matchWindow48h.total > 0
        ? [
            { label: `Next 48h ${matchWindow48h.total}`, tone: 'info' },
            {
              label: `Picked ${matchWindow48h.picked}/${matchWindow48h.total}`,
              tone: matchWindow48h.pending === 0 ? 'success' : 'info'
            },
            {
              label: `Pending ${matchWindow48h.pending}`,
              tone: matchWindow48h.pending === 0 ? 'success' : 'warning'
            }
          ]
        : [
            { label: 'Next 48h clear', tone: 'secondary' },
            { label: 'Picked 0/0', tone: 'secondary' },
            { label: 'Pending 0', tone: 'secondary' }
          ]

    const knockoutPills: TileProgressPill[] = knockoutLoading
      ? [{ label: 'Updating', tone: 'secondary' }]
      : [
          {
            label: `Pending ${knockoutPendingActions}`,
            tone: knockoutPendingActions === 0 ? 'success' : 'warning'
          },
          {
            label: `Pending now ${knockoutPendingOpenActions}`,
            tone: knockoutPendingOpenActions === 0 ? 'secondary' : 'warning'
          },
          {
            label: knockoutActivation.active ? 'Active' : 'Inactive',
            tone: knockoutActivation.active ? 'info' : 'secondary'
          }
        ]

    return {
      'group-stage': groupPills,
      'match-picks': matchPills,
      'knockout-bracket': knockoutPills,
      leaderboard: [{ label: snapshotTimestamp ? 'Snapshot live' : 'Snapshot unavailable', tone: snapshotTimestamp ? 'info' : 'secondary' }]
    }
  }, [
    groupCompletion.bestThirdDone,
    groupCompletion.groupsDone,
    groupCompletion.groupsTotal,
    groupCompletion.pending,
    groupStage.loadState.status,
    knockoutActivation.active,
    knockoutData.loadState.status,
    knockoutPendingActions,
    knockoutPendingOpenActions,
    matchWindow48h.pending,
    matchWindow48h.picked,
    matchWindow48h.total,
    picksState.state.status,
    snapshotTimestamp
  ])

  function persistRivals(nextRivals: string[]) {
    const normalized = normalizeRivalUserIds(nextRivals)
    setRivalUserIds(normalized)

    pendingPersistCountRef.current += 1
    setProfileSaving(true)

    const save = async () => {
      try {
        await writeUserProfile(mode, memberId, { rivalUserIds: normalized }, authState.user?.email ?? null)
      } catch {
        showToast({ tone: 'danger', title: 'Could not save rivals', message: 'Try again in a moment.' })
      } finally {
        pendingPersistCountRef.current = Math.max(0, pendingPersistCountRef.current - 1)
        if (pendingPersistCountRef.current === 0) {
          setProfileSaving(false)
        }
      }
    }

    persistQueueRef.current = persistQueueRef.current.then(save, save)
  }

  function routeForTile(tileKey: EntryTileKey): string {
    if (tileKey === 'group-stage') return `${routePrefix}/group-stage/A`
    if (tileKey === 'match-picks') return `${routePrefix}/match-picks`
    if (tileKey === 'knockout-bracket') return `${routePrefix}/knockout-bracket`
    return `${routePrefix}/leaderboard`
  }

  function openRoute(route: string) {
    setLastRoute(route)
    void writeUserProfile(mode, memberId, { lastRoute: route }, authState.user?.email ?? null).catch(() => {
      showToast({
        tone: 'warning',
        title: 'Could not store your continue route',
        message: 'We still sent you where you asked to go.'
      })
    })
    navigate(route)
  }

  async function handleContinue() {
    const validation = validateLastRoute(lastRoute, mode)
    if (validation.kind === 'valid') {
      void writeUserProfile(mode, memberId, { lastRoute: validation.route }, authState.user?.email ?? null).catch(() => {
        showToast({
          tone: 'warning',
          title: 'Could not update your continue route',
          message: 'Continuing anyway.'
        })
      })
      navigate(validation.route)
      return
    }

    if (validation.kind === 'invalid' || validation.kind === 'unauthorized') {
      try {
        await writeUserProfile(mode, memberId, { lastRoute: null }, authState.user?.email ?? null)
      } catch {
        // best effort only
      }
      setLastRoute(null)
    }

    navigate(landingPath)
  }

  function addRival(rivalId: string) {
    if (rivalUserIds.includes(rivalId)) return
    if (rivalUserIds.length >= 3) return
    persistRivals([...rivalUserIds, rivalId])
  }

  function removeRival(rivalId: string) {
    persistRivals(rivalUserIds.filter((id) => id !== rivalId))
  }

  function moveRival(rivalId: string, direction: -1 | 1) {
    const currentIndex = rivalUserIds.indexOf(rivalId)
    if (currentIndex < 0) return
    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= rivalUserIds.length) return

    const next = [...rivalUserIds]
    const [moved] = next.splice(currentIndex, 1)
    next.splice(nextIndex, 0, moved)
    persistRivals(next)
  }

  function clearRivals() {
    if (rivalUserIds.length === 0) return
    persistRivals([])
  }

  const rivalsInlineEditor = (
    <div className="landing-v2-rivals-inline space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone="secondary" className="landing-v2-progress-pill">
          {rivalUserIds.length}/3 rivals
        </Badge>
        <div className="flex items-center gap-2">
          {profileSaving ? <span className="text-xs text-muted-foreground">Saving...</span> : null}
          {rivalUserIds.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={clearRivals}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      <Input
        value={rivalQuery}
        onChange={(event) => setRivalQuery(event.target.value)}
        placeholder="Search players"
        className="h-8"
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="landing-v2-rivals-pane space-y-2 rounded-lg border border-border/70 bg-background/35 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your rivals</div>
          {selectedRivalEntries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/35 px-2.5 py-2 text-xs text-muted-foreground">
              Choose up to three rivals to track here.
            </div>
          ) : (
            selectedRivalEntries.map((rival, index) => (
              <div
                key={rival.id}
                className="landing-v2-rivals-row flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5"
                data-selected="true"
              >
                <ProfileAvatar name={rival.displayName} photoURL={rival.photoURL} className="h-7 w-7" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{rival.displayName}</div>
                  <div className="text-[10px] text-muted-foreground">Rival {index + 1}</div>
                </div>
                <Badge tone="secondary" className="landing-v2-progress-pill !h-5 !px-1.5 !text-[9px]">
                  R{index + 1}
                </Badge>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded px-1.5 text-[10px]"
                    disabled={profileSaving || index === 0}
                    onClick={() => moveRival(rival.id, -1)}
                  >
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded px-1.5 text-[10px]"
                    disabled={profileSaving || index === selectedRivalEntries.length - 1}
                    onClick={() => moveRival(rival.id, 1)}
                  >
                    Down
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded px-1.5 text-[10px]"
                    disabled={profileSaving}
                    onClick={() => removeRival(rival.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="landing-v2-rivals-pane space-y-2 rounded-lg border border-border/70 bg-background/35 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">People you can add</div>
          {rivalsState.status === 'loading' ? (
            <div className="space-y-2">
              <div className="h-8 animate-pulse rounded-md border border-border/70 bg-muted/35" />
              <div className="h-8 animate-pulse rounded-md border border-border/70 bg-muted/35" />
            </div>
          ) : null}

          {rivalsState.status === 'error' ? (
            <Alert tone="danger" title="Could not load players right now">
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{rivalsState.message}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 rounded px-1.5 text-[10px]"
                  onClick={() => setRivalsReloadCount((current) => current + 1)}
                >
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}

          {rivalsState.status === 'ready' && rivalsState.entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/35 px-2.5 py-2 text-xs text-muted-foreground">
              No players are available yet.
            </div>
          ) : null}

          {rivalsState.status === 'ready' && rivalsState.entries.length > 0 && filteredRivalSuggestions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/35 px-2.5 py-2 text-xs text-muted-foreground">
              No players match that search.
            </div>
          ) : null}

          {rivalsState.status === 'ready'
            ? filteredRivalSuggestions.map((entry) => {
                const capReached = rivalUserIds.length >= 3
                return (
                  <div
                    key={entry.id}
                    className="landing-v2-rivals-row flex items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5"
                    data-selected="false"
                  >
                    <ProfileAvatar name={entry.displayName} photoURL={entry.photoURL ?? null} className="h-7 w-7" />
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{entry.displayName}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-6 rounded px-1.5 text-[10px]"
                      disabled={capReached || profileSaving}
                      onClick={() => addRival(entry.id)}
                    >
                      Add
                    </Button>
                  </div>
                )
              })
            : null}
        </div>
      </div>
    </div>
  )

  return (
    <div className="landing-v2-canvas space-y-4 md:space-y-5">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Action hub"
        title="Play Center"
        subtitle="Your move."
        actions={
          <Button onClick={() => void handleContinue()} loading={profileLoading}>
            Continue
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ENTRY_TILES.map((tile) => {
          const Icon = tile.icon
          const pills = tilePillsByKey[tile.key]
          return (
            <V2Card
              key={tile.key}
              tone="tile"
              className="landing-v2-card group h-full p-4 transition-all duration-[var(--motion-duration-fast)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--v2-glow-medium),var(--shadow1)]"
            >
              <div className="relative z-[1] flex h-full flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="landing-v2-icon-shell inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-foreground">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[color:var(--v2-text-strong)]">{tile.label}</div>
                    <p className="mt-1 text-sm text-[color:var(--v2-text-muted)]">{tile.description}</p>
                    <TileProgressPills pills={pills} />
                  </div>
                </div>
                <div className="mt-auto pt-1">
                  <Button variant="secondary" size="sm" onClick={() => openRoute(routeForTile(tile.key))}>
                    Open
                  </Button>
                </div>
              </div>
            </V2Card>
          )
        })}
      </div>

      <V2Card tone="panel" className="landing-v2-snapshot p-4 md:p-5">
        <div className="relative z-[1] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="v2-heading-h2 text-foreground">Leaderboard Snapshot</h2>
              <p className="mt-1 text-sm text-[color:var(--v2-text-muted)]">See your latest standing and rival positions.</p>
            </div>
            <div className="flex items-center gap-2">
              <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot: " className="text-[11px] text-muted-foreground" />
              <Button
                variant="pillSecondary"
                size="sm"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => setIsRivalsEditing((current) => !current)}
                disabled={profileLoading}
              >
                {isRivalsEditing ? 'Done' : rivalUserIds.length === 0 ? 'Add rivals' : `Rivals (${rivalUserIds.length}/3)`}
              </Button>
            </div>
          </div>

          {publishedSnapshot.state.status === 'loading' ? (
            <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="h-56 animate-pulse rounded-xl border border-border/70 bg-muted/35" />
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/20 p-3">
                <div className="h-5 w-24 animate-pulse rounded-md bg-muted/35" />
                <div className="h-10 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
                <div className="h-10 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
                <div className="h-10 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
                <div className="h-10 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
              </div>
            </div>
          ) : null}

          {publishedSnapshot.state.status === 'error' ? (
            <Alert tone="danger" title="Snapshot unavailable">
              {publishedSnapshot.state.message}
            </Alert>
          ) : null}

          {snapshotReady && snapshotReady.leaderboardRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/35 px-3 py-3 text-sm text-muted-foreground">
              No standings are available in this snapshot yet.
            </div>
          ) : null}

          {snapshotReady && snapshotReady.leaderboardRows.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
              <LeaderboardPodium
                rows={podiumRows}
                snapshotAvailable={Boolean(snapshotTimestamp)}
                className="h-full"
              />
              <div className="landing-v2-standings-panel space-y-2 rounded-xl border p-3 md:p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--v2-text-muted)]">
                    {standingsTitle}
                  </div>
                  {isRivalsEditing ? (
                    <Badge tone="info" className="landing-v2-progress-pill">
                      Editing
                    </Badge>
                  ) : null}
                </div>
                {isRivalsEditing ? rivalsInlineEditor : null}
                <SnapshotTable rows={standingsRows} />
              </div>
            </div>
          ) : null}
        </div>
      </V2Card>

      <V2Card tone="subtle" className="landing-v2-rules p-4 md:p-5">
        <div className="space-y-2 text-sm text-muted-foreground">
          <h2 className="v2-heading-h2 text-foreground">Rules at a glance</h2>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Group-stage lock: Jun 11, 6:30 PM UTC • Jun 11, 1:30 PM CDT local</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Rival picks remain hidden until lock.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Leaderboard updates daily from snapshots.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Snapshot:</span>
            <SnapshotStamp timestamp={snapshotTimestamp} className="text-sm" />
          </div>
        </div>
      </V2Card>
    </div>
  )
}
