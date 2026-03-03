import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { buildGroupTeamCodes, isStrictGroupRanking } from '../../lib/groupRanking'
import { buildGroupStandingsSnapshot } from '../../lib/groupStageSnapshot'
import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete } from '../../lib/picks'
import type { LeaderboardEntry } from '../../types/leaderboard'
import type { Match, Team } from '../../types/matches'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  BracketIcon,
  CalendarIcon,
  ResultsIcon,
  UsersIcon
} from '../components/Icons'
import LeaderboardPodium, { type LeaderboardPodiumRow } from '../components/v2/LeaderboardPodium'
import FavoriteTeamSelectV2 from '../components/v2/FavoriteTeamSelectV2'
import MemberIdentityRowV2 from '../components/v2/MemberIdentityRowV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import PanelHeaderV2 from '../components/v2/PanelHeaderV2'
import RowShellV2 from '../components/v2/RowShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import StatusTagV2 from '../components/v2/StatusTagV2'
import StatusLineV2 from '../components/v2/StatusLineV2'
import { useFavoriteTeamPreference } from '../context/FavoriteTeamPreferenceContext'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useAuthState } from '../hooks/useAuthState'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useGroupStageData } from '../hooks/useGroupStageData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys } from '../lib/leaderboardContext'
import { validateLastRoute } from '../lib/lastRoute'
import {
  fetchRivalDirectory,
  readUserProfile,
  writeUserProfile,
  type RivalDirectoryEntry
} from '../lib/profilePersistence'
import {
  buildBestThirdCandidatesByGroup,
  buildSelectedBestThirdGroups
} from '../lib/groupStageBestThirdSelection'
import { normalizeFavoriteTeamCode } from '../lib/teamFlag'
import { cn } from '../lib/utils'

type EntryTileKey = 'group-stage' | 'match-picks' | 'knockout-bracket'
type TileStatusTone = 'neutral' | 'success' | 'warning' | 'info' | 'locked'

type EntryTile = {
  key: EntryTileKey
  label: string
  description: string
  icon: (props: { size?: number }) => JSX.Element
}

type TileStatusLine = {
  label: string
  tone: TileStatusTone
}

type SnapshotRow = {
  id: string
  name: string
  favoriteTeamCode: string | null
  rank: number | null
  points: number | null
  isViewer: boolean
}

type RivalListRow = SnapshotRow & {
  kind: 'viewer' | 'selected' | 'fallback'
  slotNumber: number | null
  selectedIndex: number | null
}

type QueueMatch = {
  match: Match
  lockTime: Date
  locked: boolean
  complete: boolean
}

type MatchdayWindow = {
  dateLabel: string
  total: number
  picked: number
  pending: number
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

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeKey(viewerId)
  return normalizeRivalUserIds(nextRivals.filter((rivalId) => normalizeKey(rivalId) !== viewerKey))
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function hasSeenIdentity(
  seenIds: Set<string>,
  seenNames: Set<string>,
  id: string | null | undefined,
  name: string | null | undefined
): boolean {
  const idKey = normalizeKey(id)
  if (idKey && seenIds.has(idKey)) return true
  const nameKey = normalizeKey(name)
  if (nameKey && seenNames.has(nameKey)) return true
  return false
}

function rememberIdentity(
  seenIds: Set<string>,
  seenNames: Set<string>,
  id: string | null | undefined,
  name: string | null | undefined
) {
  const idKey = normalizeKey(id)
  if (idKey) seenIds.add(idKey)
  const nameKey = normalizeKey(name)
  if (nameKey) seenNames.add(nameKey)
}

function matchesIdentity(
  candidateId: string | null | undefined,
  candidateName: string | null | undefined,
  viewerId: string,
  viewerName: string
): boolean {
  const candidateIdKey = normalizeKey(candidateId)
  const viewerIdKey = normalizeKey(viewerId)
  if (candidateIdKey && viewerIdKey && candidateIdKey === viewerIdKey) {
    return true
  }

  const candidateNameKey = normalizeKey(candidateName)
  const viewerNameKey = normalizeKey(viewerName)
  return Boolean(candidateNameKey && viewerNameKey && candidateNameKey === viewerNameKey)
}

function registerIdentityIndex(
  indexByIdentity: Map<string, number>,
  id: string | null | undefined,
  name: string | null | undefined,
  index: number
) {
  const idKey = normalizeKey(id)
  if (idKey && !indexByIdentity.has(`id:${idKey}`)) {
    indexByIdentity.set(`id:${idKey}`, index)
  }
  const nameKey = normalizeKey(name)
  if (nameKey && !indexByIdentity.has(`name:${nameKey}`)) {
    indexByIdentity.set(`name:${nameKey}`, index)
  }
}

function getIdentityIndex(
  indexByIdentity: Map<string, number>,
  id: string | null | undefined,
  name: string | null | undefined
): number | null {
  const idKey = normalizeKey(id)
  if (idKey) {
    const byId = indexByIdentity.get(`id:${idKey}`)
    if (typeof byId === 'number') return byId
  }

  const nameKey = normalizeKey(name)
  if (nameKey) {
    const byName = indexByIdentity.get(`name:${nameKey}`)
    if (typeof byName === 'number') return byName
  }

  return null
}

function normalizeStatus(status: Match['status'] | string): string {
  return String(status || '').toUpperCase()
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groups = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const teamMap = groups.get(match.group) ?? new Map<string, Team>()
    teamMap.set(match.homeTeam.code, match.homeTeam)
    teamMap.set(match.awayTeam.code, match.awayTeam)
    groups.set(match.group, teamMap)
  }

  const next: Record<string, Team[]> = {}
  for (const [groupId, teamMap] of groups.entries()) {
    next[groupId] = [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return next
}

function reorderRivalIds(rivalIds: string[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return rivalIds
  const sourceIndex = rivalIds.indexOf(sourceId)
  const targetIndex = rivalIds.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0) return rivalIds

  const next = [...rivalIds]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

type ComposeTrackedStandingsIdsInput = {
  viewerId: string
  viewerName: string
  rivalUserIds: string[]
  rivalMap: Map<string, RivalDirectoryEntry>
  snapshotRows: LeaderboardEntry[]
  target?: number
}

function composeTrackedStandingsIds({
  viewerId,
  viewerName,
  rivalUserIds,
  rivalMap,
  snapshotRows,
  target = 4
}: ComposeTrackedStandingsIdsInput): string[] {
  const result: string[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  const pushUnique = (id: string, name: string) => {
    const trimmed = id.trim()
    if (!trimmed) return
    if (hasSeenIdentity(seenIds, seenNames, trimmed, name)) return
    rememberIdentity(seenIds, seenNames, trimmed, name)
    result.push(trimmed)
  }

  pushUnique(viewerId, viewerName)
  for (const rivalId of rivalUserIds) {
    const rival = rivalMap.get(rivalId) ?? rivalMap.get(normalizeKey(rivalId))
    pushUnique(rivalId, rival?.displayName ?? rivalId)
    if (result.length >= target) return result.slice(0, target)
  }

  if (rivalUserIds.length <= 2) {
    for (const snapshotRow of snapshotRows) {
      const candidateId = snapshotRow.member.id?.trim()
      if (!candidateId) continue
      pushUnique(candidateId, snapshotRow.member.name || candidateId)
      if (result.length >= target) break
    }
  }

  return result.slice(0, target)
}

type SanitizeRivalUserIdsByIdentityInput = {
  nextRivals: string[]
  viewerId: string
  viewerName: string
  rivalMap: Map<string, RivalDirectoryEntry>
}

function sanitizeRivalUserIdsByIdentity({
  nextRivals,
  viewerId,
  viewerName,
  rivalMap
}: SanitizeRivalUserIdsByIdentityInput): string[] {
  const normalized = sanitizeRivalUserIds(nextRivals, viewerId)
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  rememberIdentity(seenIds, seenNames, viewerId, viewerName)

  const result: string[] = []
  for (const rivalId of normalized) {
    const rival = rivalMap.get(rivalId) ?? rivalMap.get(normalizeKey(rivalId))
    const rivalName = rival?.displayName ?? rivalId
    if (hasSeenIdentity(seenIds, seenNames, rivalId, rivalName)) continue
    rememberIdentity(seenIds, seenNames, rivalId, rivalName)
    result.push(rivalId)
    if (result.length >= 3) break
  }
  return result
}

function resolveNextPathLabel(route: string | null, mode: 'default' | 'demo'): string {
  const fallback = 'Group Stage - A'
  if (!route) return fallback

  let pathname = ''
  try {
    const parsed = new URL(route, 'https://wc.local')
    pathname = parsed.pathname.replace(/\/+$/, '') || '/'
  } catch {
    return fallback
  }

  const normalizedPath = mode === 'demo' && pathname.startsWith('/demo') ? pathname.slice('/demo'.length) || '/' : pathname
  const groupMatch = normalizedPath.match(/^\/group-stage\/([A-L])$/i)
  if (groupMatch) return `Group Stage - ${groupMatch[1].toUpperCase()}`
  if (normalizedPath === '/match-picks') return 'Match Picks'
  if (normalizedPath === '/leaderboard') return 'Leaderboard'
  if (normalizedPath === '/knockout-bracket') return 'Knockout Bracket'
  return fallback
}

function resolveNextMatchdayWindow(queueMatches: QueueMatch[], now: Date): MatchdayWindow | null {
  const upcomingUnlocked = queueMatches
    .filter((entry) => !entry.locked && entry.lockTime.getTime() >= now.getTime())
    .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())

  if (upcomingUnlocked.length === 0) return null

  const groups = new Map<string, QueueMatch[]>()
  for (const entry of upcomingUnlocked) {
    const key = getDateKeyInTimeZone(entry.match.kickoffUtc)
    const bucket = groups.get(key)
    if (bucket) bucket.push(entry)
    else groups.set(key, [entry])
  }

  const firstMatchdayKey = [...groups.keys()].sort()[0]
  const firstMatchdayEntries = (groups.get(firstMatchdayKey) ?? []).sort(
    (a, b) => new Date(a.match.kickoffUtc).getTime() - new Date(b.match.kickoffUtc).getTime()
  )
  if (firstMatchdayEntries.length === 0) return null

  const firstKickoff = firstMatchdayEntries[0].match.kickoffUtc
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(firstKickoff))

  const total = firstMatchdayEntries.length
  const picked = firstMatchdayEntries.filter((entry) => entry.complete).length

  return {
    dateLabel,
    total,
    picked,
    pending: Math.max(0, total - picked)
  }
}

function formatLocalDateTime(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input
  const timestamp = date.getTime()
  if (!Number.isFinite(timestamp)) return 'Unavailable'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date)
}

function formatHeaderTime(iso?: string | null): string {
  if (!iso) return '—'
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function resolveSnapshotRow(
  id: string,
  leaderboardById: Map<string, { entry: LeaderboardEntry; rank: number }>,
  fallbackName: string,
  favoriteTeamCode: string | null,
  isViewer: boolean
): SnapshotRow {
  const match = leaderboardById.get(normalizeKey(id))
  return {
    id,
    name: match?.entry.member.name ?? fallbackName,
    favoriteTeamCode,
    rank: match?.rank ?? null,
    points: typeof match?.entry.totalPoints === 'number' ? match.entry.totalPoints : null,
    isViewer
  }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mode = useRouteDataMode()
  const phaseState = useTournamentPhaseState()
  const viewerId = useViewerId()
  const currentUser = useCurrentUser()
  const favoriteTeamPreference = useFavoriteTeamPreference()
  const authState = useAuthState()
  const now = useNow({ tickMs: 60_000 })
  const publishedSnapshot = usePublishedSnapshot()
  const picksState = usePicksData()

  const [lastRoute, setLastRoute] = useState<string | null>(null)
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const [rivalQuery, setRivalQuery] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [rivalsReloadCount, setRivalsReloadCount] = useState(0)
  const [draggingRivalId, setDraggingRivalId] = useState<string | null>(null)
  const [dragOverRivalId, setDragOverRivalId] = useState<string | null>(null)
  const [rivalsState, setRivalsState] = useState<
    { status: 'loading' } | { status: 'ready'; entries: RivalDirectoryEntry[] } | { status: 'error'; message: string }
  >({ status: 'loading' })

  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingPersistCountRef = useRef(0)
  const rivalSearchInputRef = useRef<HTMLInputElement | null>(null)

  const isDemoMode = mode === 'demo'
  const routePrefix = isDemoMode ? '/demo' : ''
  const landingPath = isDemoMode ? '/demo' : '/'
  const memberId = viewerId

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
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
        setRivalUserIds(sanitizeRivalUserIds(profile.rivalUserIds, viewerId))
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
  }, [authState.user?.email, memberId, mode, viewerId])

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
    if (!draggingRivalId) return
    if (!rivalUserIds.includes(draggingRivalId)) {
      clearRivalDragState()
    }
  }, [draggingRivalId, rivalUserIds])

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const snapshotTimestamp = snapshotReady?.snapshotTimestamp ?? null
  const picksLastSavedLabel =
    groupStage.loadState.status === 'ready' ? formatHeaderTime(groupStage.data.updatedAt) : '—'

  const viewerName = currentUser?.name || authState.user?.displayName || authState.user?.email || 'You'
  const viewerIdentityKeys = useMemo(
    () =>
      buildViewerKeySet([
        viewerId,
        currentUser?.id ?? null,
        currentUser?.email ?? null,
        currentUser?.name ?? null
      ]),
    [currentUser?.email, currentUser?.id, currentUser?.name, viewerId]
  )
  const viewerFavoriteTeamCode = normalizeFavoriteTeamCode(
    favoriteTeamPreference.favoriteTeamCode ?? currentUser?.favoriteTeamCode
  )

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
    const map = new Map<string, RivalDirectoryEntry>()
    if (rivalsState.status !== 'ready') return map
    for (const entry of rivalsState.entries) {
      map.set(entry.id, entry)
      const key = normalizeKey(entry.id)
      if (key) map.set(key, entry)
      if (entry.displayName) {
        map.set(entry.displayName, entry)
        const normalizedName = normalizeKey(entry.displayName)
        if (normalizedName) {
          map.set(normalizedName, entry)
          map.set(`name:${normalizedName}`, entry)
        }
      }
      if (entry.email) {
        map.set(entry.email, entry)
        const normalizedEmail = normalizeKey(entry.email)
        if (normalizedEmail) {
          map.set(normalizedEmail, entry)
          map.set(`email:${normalizedEmail}`, entry)
        }
      }
      if (key) {
        map.set(`id:${key}`, entry)
      }
    }
    return map
  }, [rivalsState])

  const resolveSnapshotEntryFavoriteTeamCode = useMemo(() => {
    return (entry: LeaderboardEntry): string | null => {
      const identityKeys = resolveLeaderboardIdentityKeys(entry)
      const isViewer = identityKeys.some((key) => viewerIdentityKeys.has(normalizeKey(key)))
      if (isViewer) return viewerFavoriteTeamCode

      const memberFavoriteTeamCode = normalizeFavoriteTeamCode(entry.member.favoriteTeamCode)
      const lookupKeys = new Set<string>(identityKeys)
      const memberId = normalizeKey(entry.member.id)
      const memberEmail = normalizeKey(entry.member.email)
      const memberName = normalizeKey(entry.member.name)

      if (memberId) {
        lookupKeys.add(memberId)
        lookupKeys.add(`id:${memberId}`)
      }
      if (memberEmail) {
        lookupKeys.add(memberEmail)
        lookupKeys.add(`email:${memberEmail}`)
      }
      if (memberName) {
        lookupKeys.add(memberName)
        lookupKeys.add(`name:${memberName}`)
      }

      for (const key of lookupKeys) {
        const normalized = normalizeKey(key)
        const idLike = normalized.startsWith('id:') ? normalized.slice(3) : normalized
        const rivalEntry =
          rivalMap.get(key) ??
          rivalMap.get(normalized) ??
          rivalMap.get(idLike) ??
          rivalMap.get(`id:${idLike}`)
        if (!rivalEntry) continue
        const rivalFavoriteTeamCode = normalizeFavoriteTeamCode(rivalEntry.favoriteTeamCode)
        if (rivalFavoriteTeamCode) return rivalFavoriteTeamCode
      }

      return memberFavoriteTeamCode
    }
  }, [rivalMap, viewerFavoriteTeamCode, viewerIdentityKeys])

  const filteredRivalSuggestions = useMemo(() => {
    if (rivalsState.status !== 'ready') return []
    const selectedIds = new Set<string>()
    const selectedNames = new Set<string>()
    rememberIdentity(selectedIds, selectedNames, viewerId, viewerName)
    for (const rivalId of rivalUserIds) {
      const rival = rivalMap.get(rivalId) ?? rivalMap.get(normalizeKey(rivalId))
      rememberIdentity(selectedIds, selectedNames, rivalId, rival?.displayName ?? rivalId)
    }
    const query = rivalQuery.trim().toLowerCase()
    return rivalsState.entries
      .filter((entry) => !hasSeenIdentity(selectedIds, selectedNames, entry.id, entry.displayName))
      .filter((entry) => (query ? entry.displayName.toLowerCase().includes(query) : true))
  }, [rivalMap, rivalQuery, rivalUserIds, rivalsState, viewerId, viewerName])

  const podiumRows = useMemo(() => {
    if (!snapshotReady) return []
    return snapshotReady.leaderboardRows.slice(0, 3).map((entry, index) => {
      const rank = (index + 1) as 1 | 2 | 3
      const rowId = entry.member.id || `podium-${rank}`
      const isViewer = resolveLeaderboardIdentityKeys(entry).some((key) => viewerIdentityKeys.has(normalizeKey(key)))
      const favoriteTeamCode = resolveSnapshotEntryFavoriteTeamCode(entry)

      return {
        id: rowId,
        name: entry.member.name,
        points: entry.totalPoints,
        rank,
        favoriteTeamCode,
        isViewer
      } satisfies LeaderboardPodiumRow
    })
  }, [resolveSnapshotEntryFavoriteTeamCode, snapshotReady, viewerIdentityKeys])

  const snapshotRows = snapshotReady?.leaderboardRows ?? []

  const trackedStandingsIds = useMemo(
    () =>
      composeTrackedStandingsIds({
        viewerId,
        viewerName,
        rivalUserIds,
        rivalMap,
        snapshotRows,
        target: 4
      }),
    [rivalMap, rivalUserIds, snapshotRows, viewerId, viewerName]
  )

  const selectedRivalIndexByIdentity = useMemo(() => {
    const map = new Map<string, number>()
    rivalUserIds.forEach((id, index) => {
      const rival = rivalMap.get(id) ?? rivalMap.get(normalizeKey(id))
      registerIdentityIndex(map, id, rival?.displayName ?? id, index)
    })
    return map
  }, [rivalMap, rivalUserIds])

  const rivalsListRows = useMemo<RivalListRow[]>(() => {
    return trackedStandingsIds.map((id, index) => {
      const key = normalizeKey(id)
      const rival = rivalMap.get(id)
      const snapshotEntry = leaderboardById.get(key)?.entry
      const isViewer = matchesIdentity(id, rival?.displayName ?? snapshotEntry?.member.name ?? id, viewerId, viewerName)
      const fallbackName = isViewer ? viewerName : (rival?.displayName ?? snapshotEntry?.member.name ?? id)
      const favoriteTeamCode = isViewer
        ? viewerFavoriteTeamCode
        : normalizeFavoriteTeamCode(rival?.favoriteTeamCode)
      const selectedIndex = isViewer ? null : getIdentityIndex(selectedRivalIndexByIdentity, id, fallbackName)
      const baseRow = resolveSnapshotRow(id, leaderboardById, fallbackName, favoriteTeamCode, isViewer)

      return {
        ...baseRow,
        kind: isViewer ? 'viewer' : selectedIndex !== null ? 'selected' : 'fallback',
        slotNumber: isViewer ? null : index,
        selectedIndex
      }
    })
  }, [leaderboardById, rivalMap, selectedRivalIndexByIdentity, trackedStandingsIds, viewerFavoriteTeamCode, viewerId, viewerName])

  const isViewerOnPodium = podiumRows.some((row) => row.isViewer)
  const snapshotMatches = snapshotReady?.matches ?? matches
  const groupStandings = useMemo(() => buildGroupStandingsSnapshot(snapshotMatches), [snapshotMatches])
  const groupsFinal = groupStage.groupIds.length > 0 && groupStandings.completeGroups.size === groupStage.groupIds.length
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const bestThirdReadOnly = groupClosed || groupStage.isLocked || Boolean(snapshotReady?.groupStageComplete)
  const bestThirdCandidatesByGroup = useMemo(
    () =>
      buildBestThirdCandidatesByGroup({
        groups: groupStage.data.groups,
        groupTeams,
        standingsByGroup: groupStandings.standingsByGroup,
        isReadOnly: bestThirdReadOnly,
        groupsFinal
      }),
    [bestThirdReadOnly, groupStage.data.groups, groupStandings.standingsByGroup, groupTeams, groupsFinal]
  )
  const selectedBestThirdGroups = useMemo(
    () => buildSelectedBestThirdGroups(groupStage.data.bestThirds, bestThirdCandidatesByGroup),
    [bestThirdCandidatesByGroup, groupStage.data.bestThirds]
  )
  const selectedBestThirdCount = selectedBestThirdGroups.size

  const groupCompletion = useMemo(() => {
    let groupsDone = 0
    for (const groupId of groupStage.groupIds) {
      const selection = groupStage.data.groups[groupId] ?? {}
      const teamCodes = buildGroupTeamCodes(groupTeams[groupId] ?? [])
      if (isStrictGroupRanking(selection.ranking, teamCodes)) {
        groupsDone += 1
      }
    }
    const bestThirdDone = selectedBestThirdCount
    const groupsTotal = groupStage.groupIds.length
    const groupsRemaining = Math.max(0, groupsTotal - groupsDone)
    const bestThirdRemaining = Math.max(0, 8 - bestThirdDone)
    return {
      groupsDone,
      groupsTotal,
      bestThirdDone,
      pending: groupsRemaining + bestThirdRemaining
    }
  }, [groupStage.data.groups, groupStage.groupIds, groupTeams, selectedBestThirdCount])

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

  const nextMatchdayWindow = useMemo(() => resolveNextMatchdayWindow(queueMatches, now), [now, queueMatches])

  const knockoutPendingActions = useMemo(
    () => Math.max(0, knockoutData.totalMatches - knockoutData.completeMatches),
    [knockoutData.completeMatches, knockoutData.totalMatches]
  )

  const knockoutAvailable =
    phaseState.tournamentPhase === 'KO_OPEN' ||
    phaseState.tournamentPhase === 'KO_LOCKED' ||
    phaseState.tournamentPhase === 'FINAL'

  const tileStatusByKey = useMemo<Record<EntryTileKey, TileStatusLine>>(() => {
    const groupLoading = groupStage.loadState.status === 'loading'
    const knockoutLoading = knockoutData.loadState.status === 'loading'
    const picksLoading = picksState.state.status === 'loading'

    const groupStatus: TileStatusLine = groupLoading
      ? { label: 'Updating group progress.', tone: 'neutral' }
      : groupClosed
        ? {
            label: `${groupCompletion.groupsDone}/${groupCompletion.groupsTotal} groups set • ${groupCompletion.bestThirdDone}/8 best-thirds selected.`,
            tone: 'locked'
          }
        : {
            label: `${groupCompletion.pending} groups left before lock • ${groupCompletion.bestThirdDone}/8 best-thirds selected.`,
            tone: groupCompletion.pending === 0 ? 'success' : 'warning'
          }

    const matchStatus: TileStatusLine = picksLoading
      ? { label: 'Updating match pick progress.', tone: 'neutral' }
      : matchWindow48h.total > 0
        ? {
            label: `${matchWindow48h.picked}/${matchWindow48h.total} picks set in the next 48 hours.`,
            tone: matchWindow48h.pending === 0 ? 'success' : 'info'
          }
        : nextMatchdayWindow
          ? {
              label: `${nextMatchdayWindow.picked}/${nextMatchdayWindow.total} picks set for ${nextMatchdayWindow.dateLabel}.`,
              tone: nextMatchdayWindow.pending === 0 ? 'success' : 'info'
            }
        : { label: 'No open match picks right now.', tone: 'locked' }

    const knockoutStatus: TileStatusLine = knockoutLoading
      ? { label: 'Updating knockout availability.', tone: 'neutral' }
      : knockoutAvailable
        ? {
            label: `${knockoutData.completeMatches}/${knockoutData.totalMatches || 0} knockout picks set.`,
            tone: knockoutPendingActions === 0 ? 'success' : 'info'
          }
        : {
            label: 'Opens after group outcomes lock and matchups are confirmed.',
            tone: 'locked'
          }

    return {
      'group-stage': groupStatus,
      'match-picks': matchStatus,
      'knockout-bracket': knockoutStatus
    }
  }, [
    groupClosed,
    groupCompletion.bestThirdDone,
    groupCompletion.groupsDone,
    groupCompletion.groupsTotal,
    groupCompletion.pending,
    groupStage.loadState.status,
    knockoutAvailable,
    knockoutData.completeMatches,
    knockoutData.loadState.status,
    knockoutData.totalMatches,
    knockoutPendingActions,
    nextMatchdayWindow,
    matchWindow48h.pending,
    matchWindow48h.picked,
    matchWindow48h.total,
    picksState.state.status
  ])

  const continuePreviewRoute = useMemo(() => {
    const validation = validateLastRoute(lastRoute, mode)
    if (validation.kind === 'valid') return validation.route
    return `${routePrefix}/group-stage/A`
  }, [lastRoute, mode, routePrefix])

  const continuePreviewLabel = useMemo(
    () => resolveNextPathLabel(continuePreviewRoute, mode),
    [continuePreviewRoute, mode]
  )

  const currentTimeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit'
      }).format(now),
    [now]
  )

  const nextOpenQueueMatch = useMemo(() => queueMatches.find((entry) => !entry.locked) ?? null, [queueMatches])
  const nextMatchLockLabel = useMemo(
    () => (nextOpenQueueMatch ? formatLocalDateTime(nextOpenQueueMatch.lockTime) : 'No upcoming open locks'),
    [nextOpenQueueMatch]
  )

  const groupLockLabel = useMemo(
    () => (groupLockTime ? formatLocalDateTime(groupLockTime) : 'Group lock unavailable'),
    [groupLockTime]
  )

  const knockoutOpenLabel = knockoutAvailable
    ? 'Knockout picks are open now.'
    : 'Knockout picks open once group outcomes lock and matchups are confirmed.'

  function persistRivals(nextRivals: string[]) {
    const normalized = sanitizeRivalUserIdsByIdentity({
      nextRivals,
      viewerId,
      viewerName,
      rivalMap
    })
    if (arraysEqual(rivalUserIds, normalized)) return
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

  useEffect(() => {
    const sanitized = sanitizeRivalUserIdsByIdentity({
      nextRivals: rivalUserIds,
      viewerId,
      viewerName,
      rivalMap
    })
    if (arraysEqual(rivalUserIds, sanitized)) return
    persistRivals(sanitized)
  }, [rivalMap, rivalUserIds, viewerId, viewerName])

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
    const rivalEntry = rivalMap.get(rivalId) ?? rivalMap.get(normalizeKey(rivalId))
    const rivalName = rivalEntry?.displayName ?? rivalId
    if (matchesIdentity(rivalId, rivalName, viewerId, viewerName)) return
    const alreadyTracked = rivalUserIds.some((selectedId) => {
      const selectedEntry = rivalMap.get(selectedId) ?? rivalMap.get(normalizeKey(selectedId))
      return matchesIdentity(rivalId, rivalName, selectedId, selectedEntry?.displayName ?? selectedId)
    })
    if (alreadyTracked) return
    if (rivalUserIds.length >= 3) return
    persistRivals([...rivalUserIds, rivalId])
  }

  function removeRival(rivalId: string) {
    persistRivals(rivalUserIds.filter((id) => id !== rivalId))
  }

  function clearRivalDragState() {
    setDraggingRivalId(null)
    setDragOverRivalId(null)
  }

  function clearRivals() {
    if (rivalUserIds.length === 0) return
    persistRivals([])
  }

  function handleSelectedRivalDragStart(event: DragEvent<HTMLDivElement>, rivalId: string) {
    if (profileSaving) return
    setDraggingRivalId(rivalId)
    setDragOverRivalId(rivalId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', rivalId)
  }

  function handleSelectedRivalDragOver(event: DragEvent<HTMLDivElement>, rivalId: string) {
    if (!draggingRivalId || draggingRivalId === rivalId) return
    event.preventDefault()
    if (dragOverRivalId === rivalId) return
    setDragOverRivalId(rivalId)
  }

  function handleSelectedRivalDrop(event: DragEvent<HTMLDivElement>, rivalId: string) {
    event.preventDefault()
    if (profileSaving) {
      clearRivalDragState()
      return
    }

    const payload = event.dataTransfer.getData('text/plain').trim()
    const sourceId = draggingRivalId ?? payload
    if (!sourceId) {
      clearRivalDragState()
      return
    }
    const next = reorderRivalIds(rivalUserIds, sourceId, rivalId)
    clearRivalDragState()
    if (arraysEqual(next, rivalUserIds)) return
    persistRivals(next)
  }

  const rivalsBoard = (
    <div className="space-y-3">
      <div className="landing-v2-rivals-header-row flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[color:var(--v2-text-strong)]">Rivals</div>
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span>{rivalUserIds.length}/3 selected</span>
          {profileSaving ? <span>Saving...</span> : null}
          {rivalUserIds.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-8 rounded-md px-2 text-[12px]" onClick={clearRivals}>
              Clear all
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="landing-v2-rivals-pane space-y-2" data-pane="selected">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your lineup</div>
          <div className="space-y-2">
            {rivalsListRows.map((row, index) => {
              const selectedRivalId = row.selectedIndex !== null ? rivalUserIds[row.selectedIndex] : null
              const isSelectedDraggable = Boolean(row.kind === 'selected' && selectedRivalId && !profileSaving)
              const isDragging = Boolean(selectedRivalId && draggingRivalId === selectedRivalId)
              const isDragOver = Boolean(selectedRivalId && draggingRivalId && dragOverRivalId === selectedRivalId)
              const lineupLabel =
                row.kind === 'viewer'
                  ? 'You'
                  : row.kind === 'selected' && row.selectedIndex !== null
                    ? `Rival ${row.selectedIndex + 1}`
                    : `Snapshot fill${row.slotNumber ? ` • R${row.slotNumber}` : ''}`

              return (
                <RowShellV2
                  key={`${row.id}-${index}`}
                  state={row.kind === 'viewer' ? 'you' : row.kind === 'selected' ? 'rival' : 'disabled'}
                  className="landing-v2-rivals-row landing-v2-rival-slot px-2 py-1.5"
                  data-kind={row.kind}
                  data-draggable={isSelectedDraggable ? 'true' : 'false'}
                  data-dragging={isDragging ? 'true' : 'false'}
                  data-drag-over={isDragOver ? 'true' : 'false'}
                  draggable={isSelectedDraggable}
                  onDragStart={(event) => {
                    if (!selectedRivalId) return
                    handleSelectedRivalDragStart(event, selectedRivalId)
                  }}
                  onDragOver={(event) => {
                    if (!selectedRivalId) return
                    handleSelectedRivalDragOver(event, selectedRivalId)
                  }}
                  onDrop={(event) => {
                    if (!selectedRivalId) return
                    handleSelectedRivalDrop(event, selectedRivalId)
                  }}
                  onDragEnd={clearRivalDragState}
                >
                  <MemberIdentityRowV2
                    name={row.name}
                    favoriteTeamCode={row.favoriteTeamCode}
                    avatarClassName="h-12 w-[72px]"
                    subtitle={
                      <span>
                        {lineupLabel}
                        <span className="mx-1.5">·</span>
                        <span>{row.rank ? `#${row.rank}` : 'Unranked'}</span>
                        <span className="mx-1.5">·</span>
                        <span>{row.points ?? '—'} pts</span>
                      </span>
                    }
                    trailing={
                      row.kind === 'selected' && row.selectedIndex !== null && selectedRivalId ? (
                        <div className="flex items-center gap-1">
                          <span className="landing-v2-rival-drag-handle text-[11px] text-muted-foreground" aria-hidden="true">
                            ::
                          </span>
                          <Button
                            variant="quiet"
                            size="xs"
                            className="h-8 rounded px-2 text-[12px]"
                            disabled={profileSaving}
                            onClick={() => removeRival(selectedRivalId)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : null
                    }
                  />
                </RowShellV2>
              )
            })}
          </div>
        </div>

        <div className="landing-v2-rivals-pane space-y-2" data-pane="suggested">
          <div className="space-y-2">
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Find players</div>
            <Input
              ref={rivalSearchInputRef}
              value={rivalQuery}
              onChange={(event) => setRivalQuery(event.target.value)}
              placeholder="Search players"
              className="h-9"
            />
          </div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Suggestions</div>
          {rivalsState.status === 'loading' ? (
            <div className="space-y-2">
              <div className="h-9 animate-pulse rounded-md border border-border/70 bg-muted/35" />
              <div className="h-9 animate-pulse rounded-md border border-border/70 bg-muted/35" />
            </div>
          ) : null}

          {rivalsState.status === 'error' ? (
            <Alert tone="danger" title="Could not load players right now">
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted-foreground">{rivalsState.message}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded px-2 text-[12px]"
                  onClick={() => setRivalsReloadCount((current) => current + 1)}
                >
                  Retry
                </Button>
              </div>
            </Alert>
          ) : null}

          {rivalsState.status === 'ready' && rivalsState.entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/35 px-2.5 py-2 text-[13px] text-muted-foreground">
              No players are available yet.
            </div>
          ) : null}

          {rivalsState.status === 'ready' && rivalsState.entries.length > 0 && filteredRivalSuggestions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 bg-muted/35 px-2.5 py-2 text-[13px] text-muted-foreground">
                No players match that search.
              </div>
            ) : null}

          {rivalsState.status === 'ready'
            ? (
                <div className="landing-v2-rivals-suggestions-scroll space-y-2">
                  {filteredRivalSuggestions.map((entry) => {
                    const capReached = rivalUserIds.length >= 3
                    return (
                      <RowShellV2
                        key={entry.id}
                        className="landing-v2-rivals-row px-2 py-1.5"
                        data-kind="suggestion"
                      >
                        <MemberIdentityRowV2
                          name={entry.displayName}
                          favoriteTeamCode={entry.favoriteTeamCode ?? null}
                          avatarClassName="h-12 w-[72px]"
                          trailing={(
                            <div className="group/add relative">
                              <Button
                                variant="tertiary"
                                size="xs"
                                className="h-8 rounded px-2 text-[12px]"
                                disabled={capReached || profileSaving}
                                onClick={() => addRival(entry.id)}
                                aria-describedby={capReached ? `rival-cap-tip-${entry.id}` : undefined}
                              >
                                Add
                              </Button>
                              {capReached ? (
                                <span
                                  id={`rival-cap-tip-${entry.id}`}
                                  role="tooltip"
                                  className="landing-v2-add-tooltip pointer-events-none absolute right-[calc(100%+0.45rem)] top-1/2 z-20 -translate-y-1/2 opacity-0 transition-all group-hover/add:opacity-100"
                                >
                                  Max 3 rivals. Remove one first.
                                </span>
                              ) : null}
                            </div>
                          )}
                        />
                      </RowShellV2>
                    )
                  })}
                </div>
              )
            : null}
        </div>
      </div>
    </div>
  )

  return (
    <PageShellV2 className="landing-v2-canvas">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Your move"
        title="Play Center"
        subtitle="Plan your next picks and keep your rivals in view."
        actions={(
          <div className="flex flex-col items-end gap-2">
            <div className="landing-v2-current-time text-right text-xl font-semibold text-[color:var(--v2-text-strong)]">
              {currentTimeLabel}
            </div>
            <Button onClick={() => void handleContinue()} loading={profileLoading}>
              Continue: {continuePreviewLabel}
            </Button>
          </div>
        )}
        metadata={(
          <>
            <span className="truncate whitespace-nowrap">Saved {picksLastSavedLabel}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot " />
          </>
        )}
      />

      <SectionCardV2 tone="panel" density="none" className="p-4 md:hidden">
        <PanelHeaderV2
          title="Favorite Team"
          subtitle="Pick your team identity for avatars and rival views."
          meta="Use sidebar on desktop."
          actions={favoriteTeamPreference.isSaving ? <StatusTagV2 tone="warning">Saving...</StatusTagV2> : <StatusTagV2 tone="secondary">Profile</StatusTagV2>}
        />
        <div className="mt-3">
          <FavoriteTeamSelectV2
            value={viewerFavoriteTeamCode}
            disabled={favoriteTeamPreference.isLoading}
            loading={favoriteTeamPreference.isSaving}
            onChange={favoriteTeamPreference.setFavoriteTeamCode}
            variant="default"
            menuPlacement="bottom"
          />
        </div>
      </SectionCardV2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ENTRY_TILES.map((tile) => {
          const Icon = tile.icon
          const status = tileStatusByKey[tile.key]
          return (
            <SectionCardV2
              key={tile.key}
              tone="tile"
              density="none"
              className="landing-v2-card group h-full p-4 transition-all duration-[var(--motion-duration-fast)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_var(--v2-glow-medium),var(--shadow1)]"
            >
              <div className="relative z-[1] flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[18px] font-semibold leading-tight text-[color:var(--v2-text-strong)]">{tile.label}</div>
                    <p className="mt-1 text-[14px] text-[color:var(--v2-text-muted)]">{tile.description}</p>
                  </div>
                  <div className="landing-v2-card-icon-rail flex w-[74px] shrink-0 items-center justify-center">
                    <Icon size={42} />
                  </div>
                </div>
                <StatusLineV2 tone={status.tone} className="min-h-10 bg-background/45">
                  {status.label}
                </StatusLineV2>
                <div className="pt-1">
                  <Button variant="secondary" size="sm" className="h-9 px-3 text-[13px]" onClick={() => openRoute(routeForTile(tile.key))}>
                    Open
                  </Button>
                </div>
              </div>
            </SectionCardV2>
          )
        })}
      </div>

      <div className="v2-section-flat">
        <div className="v2-section-flat-header">
          <div>
            <h2 className="v2-heading-h2 text-foreground">Leaderboard</h2>
          </div>
          <div className="flex items-center gap-3">
            <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot " />
            <div className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
              <UsersIcon size={13} />
              <span>{rivalUserIds.length}/3 selected</span>
            </div>
          </div>
        </div>

        <div className="v2-section-flat-divider" />

        {publishedSnapshot.state.status === 'loading' ? (
          <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="h-56 animate-pulse rounded-xl border border-border/70 bg-muted/35" />
            <div className="space-y-2 rounded-xl border border-border/70 bg-background/20 p-3">
              <div className="h-5 w-24 animate-pulse rounded-md bg-muted/35" />
              <div className="h-11 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
              <div className="h-11 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
              <div className="h-11 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
              <div className="h-11 animate-pulse rounded-lg border border-border/70 bg-muted/35" />
            </div>
          </div>
        ) : null}

        {publishedSnapshot.state.status === 'error' ? (
          <Alert tone="danger" title="Snapshot unavailable">
            {publishedSnapshot.state.message}
          </Alert>
        ) : null}

        {snapshotReady?.projectedGroupPredictionsLimited ? (
          <Alert tone="warning" title="Projected comparison limited">
            Group-stage projection comparisons are partially unavailable for your role.
          </Alert>
        ) : null}

        {snapshotReady && snapshotReady.leaderboardRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/35 px-3 py-3 text-[14px] text-muted-foreground">
            No standings are available in this snapshot yet.
          </div>
        ) : null}

        {snapshotReady && snapshotReady.leaderboardRows.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[0.92fr_1.08fr]">
            <LeaderboardPodium
              rows={podiumRows}
              snapshotAvailable={Boolean(snapshotTimestamp)}
              className={cn('h-full', isViewerOnPodium && 'landing-v2-podium-viewer')}
            />
            <div className="landing-v2-standings-panel space-y-2 rounded-xl border p-3 md:p-3.5">
              {rivalsBoard}
            </div>
          </div>
        ) : null}
      </div>

      <SectionCardV2 tone="subtle" className="landing-v2-rules">
        <div className="space-y-2 text-[15px] text-muted-foreground">
          <h2 className="v2-heading-h2 text-foreground">Rules at a glance</h2>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Picks stay editable inside the rolling 48-hour match window.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Next match lock: {nextMatchLockLabel}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>{knockoutOpenLabel}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Rival picks stay hidden until group lock ({groupLockLabel}).</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--secondary)] opacity-80" aria-hidden="true" />
            <span>Leaderboard reflects published snapshots.</span>
          </div>
        </div>
      </SectionCardV2>
    </PageShellV2>
  )
}
