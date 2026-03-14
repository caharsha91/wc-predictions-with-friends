import {
  type DragEvent,
  type ReactNode,
  type TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { findPick, isPickComplete } from '../../../lib/picks'
import { isStrictGroupRanking } from '../../../lib/groupRanking'
import type { LeaderboardEntry } from '../../../types/leaderboard'
import type { Match } from '../../../types/matches'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '../../components/ui/Sheet'
import { CompanionButtonLink } from '../../components/mobile/CompanionSafeActions'
import PageShellV2 from '../../components/v2/PageShellV2'
import FlagBadgeV2 from '../../components/v2/FlagBadgeV2'
import RowShellV2 from '../../components/v2/RowShellV2'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import SnapshotStamp from '../../components/v2/SnapshotStamp'
import StatusTagV2 from '../../components/v2/StatusTagV2'
import { useTournamentPhaseState } from '../../context/TournamentPhaseContext'
import { useAuthState } from '../../hooks/useAuthState'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { usePublishedSnapshot } from '../../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { useToast } from '../../hooks/useToast'
import { useViewerId } from '../../hooks/useViewerId'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys } from '../../lib/leaderboardContext'
import { buildLeaderboardPresentation } from '../../lib/leaderboardPresentation'
import { rankRowsWithTiePriority } from '../../lib/leaderboardTieRanking'
import {
  buildRivalComparisonIdentities,
  resolveCanonicalRivalIds
} from '../../lib/rivalIdentity'
import {
  fetchRivalDirectory,
  readUserProfile,
  writeUserProfile,
  type RivalDirectoryEntry
} from '../../lib/profilePersistence'
import {
  buildCanonicalTeamOptions,
  normalizeFavoriteTeamCode,
  resolveTeamFlagMeta,
  UNKNOWN_FLAG_ASSET_PATH
} from '../../lib/teamFlag'
import { computeMatchTimelineModel } from '../../lib/matchTimeline'
import CompanionLeaderboardContent from './CompanionLeaderboardContent'
import CompanionPredictionsContent from './CompanionPredictionsContent'

const BEST_THIRD_TARGET = 8
const RIVAL_LIMIT = 3

const TEAM_OPTIONS = buildCanonicalTeamOptions().sort((left, right) => left.name.localeCompare(right.name))
const LETTER_RAIL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')

type HomeProfileState = {
  status: 'loading' | 'ready' | 'error'
  favoriteTeamCode: string | null
  rivalUserIds: string[]
  rivalDirectory: RivalDirectoryEntry[]
  message: string | null
}

type RankedSnapshotRow = {
  entry: LeaderboardEntry
  rank: number
  tieCount: number
  points: number
}

type RivalStanding = {
  rivalId: string
  displayName: string
  favoriteTeamCode: string | null
  rankLabel: string
  pointsLabel: string
}

function CompanionPageFrame({
  title,
  kicker,
  children
}: {
  title: string
  kicker?: string
  children: ReactNode
}) {
  return (
    <PageShellV2 className="space-y-3">
      <header className="space-y-1 px-0.5">
        {kicker ? <div className="v2-type-kicker">{kicker}</div> : null}
        <h1 className="v2-type-title-section text-foreground">{title}</h1>
      </header>
      {children}
    </PageShellV2>
  )
}

function buildGroupTeams(matches: Match[]): Record<string, string[]> {
  const groups = new Map<string, Set<string>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const existing = groups.get(match.group) ?? new Set<string>()
    existing.add(match.homeTeam.code)
    existing.add(match.awayTeam.code)
    groups.set(match.group, existing)
  }

  const grouped: Record<string, string[]> = {}
  for (const [groupId, teamSet] of groups.entries()) {
    grouped[groupId] = [...teamSet.values()].sort((left, right) => left.localeCompare(right))
  }
  return grouped
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function formatKickoff(utcIso: string | null): string {
  if (!utcIso) return 'No upcoming kickoff'
  const value = new Date(utcIso)
  if (!Number.isFinite(value.getTime())) return 'No upcoming kickoff'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value)
}

function formatKnockoutPhaseLabel(phase: string): string {
  if (phase === 'GROUP_OPEN') return 'Pre-knockout'
  return phase
}

function formatRankLabel(rank: number, tieCount: number): string {
  return tieCount > 1 ? `T#${rank}` : `#${rank}`
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function sanitizeRivalIds(nextRivalIds: string[], viewerId: string, directory: RivalDirectoryEntry[]): string[] {
  const viewerKey = normalizeKey(viewerId)
  const directoryById = new Map<string, string>()
  for (const entry of directory) {
    const key = normalizeKey(entry.id)
    if (!key) continue
    if (!directoryById.has(key)) directoryById.set(key, entry.id)
  }

  const seen = new Set<string>()
  const result: string[] = []
  for (const rivalId of nextRivalIds) {
    const key = normalizeKey(rivalId)
    const canonical = directoryById.get(key)
    const canonicalKey = normalizeKey(canonical)
    if (!canonical || !canonicalKey || canonicalKey === viewerKey || seen.has(canonicalKey)) continue
    seen.add(canonicalKey)
    result.push(canonical)
    if (result.length >= RIVAL_LIMIT) break
  }

  return result
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

function StatusCopy({ children }: { children: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{children}</div>
}

function FavoriteTeamSheet({
  open,
  onOpenChange,
  favoriteTeamCode,
  onSave,
  saving
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  favoriteTeamCode: string | null
  onSave: (nextFavoriteTeamCode: string | null) => Promise<void>
  saving: boolean
}) {
  const [query, setQuery] = useState('')
  const [draftFavoriteTeamCode, setDraftFavoriteTeamCode] = useState<string | null>(favoriteTeamCode)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!open) return
    setDraftFavoriteTeamCode(favoriteTeamCode)
    setQuery('')
  }, [favoriteTeamCode, open])

  const filteredOptions = useMemo(() => {
    const queryKey = query.trim().toLowerCase()
    if (!queryKey) return TEAM_OPTIONS

    return TEAM_OPTIONS.filter((option) => {
      return option.code.toLowerCase().includes(queryKey) || option.name.toLowerCase().includes(queryKey)
    })
  }, [query])

  const sections = useMemo(() => {
    const grouped = new Map<string, Array<{ code: string; name: string }>>()
    for (const option of filteredOptions) {
      const letter = option.name[0]?.toUpperCase() || '#'
      const key = /^[A-Z]$/.test(letter) ? letter : '#'
      const existing = grouped.get(key) ?? []
      existing.push(option)
      grouped.set(key, existing)
    }
    return LETTER_RAIL.filter((letter) => grouped.has(letter)).map((letter) => ({
      letter,
      options: grouped.get(letter) ?? []
    }))
  }, [filteredOptions])

  const hasChanges = normalizeFavoriteTeamCode(draftFavoriteTeamCode) !== normalizeFavoriteTeamCode(favoriteTeamCode)

  async function handleSave() {
    if (!hasChanges) {
      onOpenChange(false)
      return
    }
    try {
      await onSave(draftFavoriteTeamCode)
      onOpenChange(false)
    } catch {
      // Keep sheet open so user can retry after toast.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[86vh] w-full max-w-xl rounded-t-2xl">
        <SheetHeader className="space-y-2 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-sm font-semibold uppercase tracking-[0.12em]">Select favorite team</SheetTitle>
            <button
              type="button"
              className="text-sm font-semibold text-muted-foreground"
              onClick={() => setDraftFavoriteTeamCode(null)}
              disabled={saving}
            >
              Clear
            </button>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search team"
            className="h-10"
          />
        </SheetHeader>

        <div className="relative flex-1 overflow-y-auto px-4 pb-4">
          <div className="pr-8">
            {sections.map((section) => (
              <div
                key={section.letter}
                ref={(element) => {
                  sectionRefs.current[section.letter] = element
                }}
                className="space-y-1 pb-2"
              >
                <div className="v2-type-kicker py-1 text-muted-foreground">{section.letter}</div>
                {section.options.map((option) => {
                  const selected = draftFavoriteTeamCode === option.code
                  const meta = resolveTeamFlagMeta({ code: option.code, name: option.name })
                  return (
                    <button
                      key={option.code}
                      type="button"
                      className="w-full text-left"
                      onClick={() => setDraftFavoriteTeamCode(option.code)}
                      disabled={saving}
                    >
                      <RowShellV2
                        depth={selected ? 'prominent' : 'embedded'}
                        state={selected ? 'selection' : 'default'}
                        interactive={false}
                        className="px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-2">
                            <FlagBadgeV2
                              src={meta.assetPath}
                              fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                              size="sm"
                              className="overflow-hidden rounded-md"
                            />
                            <div className="truncate text-sm font-semibold text-foreground">
                              {option.code}
                              <span className="ml-1 text-muted-foreground">{option.name}</span>
                            </div>
                          </div>
                          {selected ? <StatusTagV2 tone="success">Selected</StatusTagV2> : null}
                        </div>
                      </RowShellV2>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="absolute inset-y-0 right-0 flex flex-col items-end justify-center gap-0.5 py-1 pr-1">
            {LETTER_RAIL.map((letter) => (
              <button
                key={letter}
                type="button"
                className="px-1 text-xs font-medium text-muted-foreground"
                onClick={() => sectionRefs.current[letter]?.scrollIntoView({ block: 'start' })}
                disabled={!sectionRefs.current[letter]}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-2 px-4 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={!hasChanges} loading={saving}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ManageRivalsSheet({
  open,
  onOpenChange,
  rivalUserIds,
  rivalDirectory,
  viewerId,
  rivalStandingById,
  onSave,
  saving
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rivalUserIds: string[]
  rivalDirectory: RivalDirectoryEntry[]
  viewerId: string
  rivalStandingById: Map<string, RivalStanding>
  onSave: (nextRivalIds: string[]) => Promise<void>
  saving: boolean
}) {
  const [query, setQuery] = useState('')
  const [draftRivalIds, setDraftRivalIds] = useState<string[]>(rivalUserIds)
  const [draggingRivalId, setDraggingRivalId] = useState<string | null>(null)
  const [dragOverRivalId, setDragOverRivalId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraftRivalIds(rivalUserIds)
    setQuery('')
    setDraggingRivalId(null)
    setDragOverRivalId(null)
  }, [open, rivalUserIds])

  const directoryById = useMemo(() => {
    const map = new Map<string, RivalDirectoryEntry>()
    for (const entry of rivalDirectory) {
      map.set(normalizeKey(entry.id), entry)
    }
    return map
  }, [rivalDirectory])

  const selectedRivals = useMemo(() => {
    return draftRivalIds
      .map((rivalId, index) => {
        const entry = directoryById.get(normalizeKey(rivalId))
        if (!entry) return null
        return {
          id: entry.id,
          index,
          displayName: entry.displayName,
          favoriteTeamCode: normalizeFavoriteTeamCode(entry.favoriteTeamCode),
          ranking: rivalStandingById.get(entry.id)
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  }, [directoryById, draftRivalIds, rivalStandingById])

  const availableRivals = useMemo(() => {
    const selected = new Set(draftRivalIds.map((id) => normalizeKey(id)))
    const queryKey = query.trim().toLowerCase()

    return rivalDirectory.filter((entry) => {
      const entryIdKey = normalizeKey(entry.id)
      if (!entryIdKey || selected.has(entryIdKey) || entryIdKey === normalizeKey(viewerId)) return false
      if (!queryKey) return true

      return (
        entry.displayName.toLowerCase().includes(queryKey) ||
        entry.id.toLowerCase().includes(queryKey) ||
        (entry.email ?? '').toLowerCase().includes(queryKey)
      )
    })
  }, [draftRivalIds, query, rivalDirectory, viewerId])

  const hasChanges = !arraysEqual(
    sanitizeRivalIds(rivalUserIds, viewerId, rivalDirectory),
    sanitizeRivalIds(draftRivalIds, viewerId, rivalDirectory)
  )

  function addRival(rivalId: string) {
    if (draftRivalIds.length >= RIVAL_LIMIT) return
    if (draftRivalIds.some((entry) => normalizeKey(entry) === normalizeKey(rivalId))) return
    setDraftRivalIds((current) => [...current, rivalId])
  }

  function removeRival(rivalId: string) {
    setDraftRivalIds((current) => current.filter((entry) => normalizeKey(entry) !== normalizeKey(rivalId)))
  }

  function moveRival(sourceId: string, targetId: string) {
    setDraftRivalIds((current) => reorderRivalIds(current, sourceId, targetId))
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, rivalId: string) {
    if (saving) return
    setDraggingRivalId(rivalId)
    setDragOverRivalId(rivalId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', rivalId)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, rivalId: string) {
    if (!draggingRivalId || draggingRivalId === rivalId) return
    event.preventDefault()
    setDragOverRivalId(rivalId)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, rivalId: string) {
    event.preventDefault()
    const sourceId = draggingRivalId ?? event.dataTransfer.getData('text/plain').trim()
    if (!sourceId || sourceId === rivalId) {
      setDraggingRivalId(null)
      setDragOverRivalId(null)
      return
    }
    moveRival(sourceId, rivalId)
    setDraggingRivalId(null)
    setDragOverRivalId(null)
  }

  function handleTouchStart(_: TouchEvent<HTMLDivElement>, rivalId: string) {
    if (saving) return
    setDraggingRivalId(rivalId)
    setDragOverRivalId(rivalId)
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!draggingRivalId) return
    const touch = event.touches[0]
    if (!touch) return
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const row = element?.closest('[data-rival-row-id]') as HTMLElement | null
    const overRivalId = row?.dataset.rivalRowId ?? null
    if (overRivalId && overRivalId !== dragOverRivalId) {
      setDragOverRivalId(overRivalId)
    }
  }

  function handleTouchEnd() {
    if (!draggingRivalId || !dragOverRivalId || draggingRivalId === dragOverRivalId) {
      setDraggingRivalId(null)
      setDragOverRivalId(null)
      return
    }
    moveRival(draggingRivalId, dragOverRivalId)
    setDraggingRivalId(null)
    setDragOverRivalId(null)
  }

  async function handleSave() {
    const sanitized = sanitizeRivalIds(draftRivalIds, viewerId, rivalDirectory)
    try {
      await onSave(sanitized)
      onOpenChange(false)
    } catch {
      // Keep sheet open so user can retry after toast.
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[88vh] w-full max-w-xl rounded-t-2xl">
        <SheetHeader className="space-y-1.5 px-4 py-4">
          <div className="v2-type-kicker">Manage rivals</div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">{draftRivalIds.length}/{RIVAL_LIMIT} selected</h2>
            {saving ? <StatusTagV2 tone="warning">Saving</StatusTagV2> : null}
          </div>
        </SheetHeader>

        <div className="space-y-3 overflow-y-auto px-4 pb-3">
          <div className="space-y-2">
            <div className="v2-type-kicker">My rivals</div>
            {selectedRivals.length === 0 ? (
              <StatusCopy>No rivals selected yet.</StatusCopy>
            ) : (
              <div className="space-y-1.5">
                {selectedRivals.map((rival) => {
                  const dragActive = draggingRivalId === rival.id
                  const dragOver = draggingRivalId && dragOverRivalId === rival.id
                  const rankingLabel = rival.ranking ? `${rival.ranking.rankLabel} • ${rival.ranking.pointsLabel}` : 'Unranked • — pts'
                  const flagMeta = resolveTeamFlagMeta({
                    code: rival.favoriteTeamCode,
                    name: rival.displayName,
                    label: rival.displayName
                  })

                  return (
                    <RowShellV2
                      key={rival.id}
                      depth="embedded"
                      state="rival"
                      className="px-2.5 py-2"
                      data-rival-row-id={rival.id}
                      data-dragging={dragActive ? 'true' : 'false'}
                      data-drag-over={dragOver ? 'true' : 'false'}
                      draggable={!saving}
                      onDragStart={(event) => handleDragStart(event, rival.id)}
                      onDragOver={(event) => handleDragOver(event, rival.id)}
                      onDrop={(event) => handleDrop(event, rival.id)}
                      onDragEnd={() => {
                        setDraggingRivalId(null)
                        setDragOverRivalId(null)
                      }}
                      onTouchStart={(event) => handleTouchStart(event, rival.id)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="v2-type-chip text-muted-foreground" aria-hidden="true">::</span>
                          <FlagBadgeV2
                            src={flagMeta.assetPath}
                            fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                            size="sm"
                            className="overflow-hidden rounded-md"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{rival.displayName}</div>
                            <div className="v2-type-caption">{rankingLabel}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <StatusTagV2 tone="rival">R{rival.index + 1}</StatusTagV2>
                          <Button
                            variant="quiet"
                            size="xs"
                            disabled={saving}
                            onClick={() => removeRival(rival.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </RowShellV2>
                  )
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="v2-type-kicker">Available players</div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a player"
              className="h-10"
            />
            <div className="space-y-1.5">
              {availableRivals.length === 0 ? (
                <StatusCopy>No players available for add.</StatusCopy>
              ) : (
                availableRivals.map((entry) => {
                  const flagMeta = resolveTeamFlagMeta({
                    code: normalizeFavoriteTeamCode(entry.favoriteTeamCode),
                    name: entry.displayName,
                    label: entry.displayName
                  })

                  return (
                    <RowShellV2 key={entry.id} depth="embedded" interactive={false} className="px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-2">
                          <FlagBadgeV2
                            src={flagMeta.assetPath}
                            fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                            size="sm"
                            className="overflow-hidden rounded-md"
                          />
                          <div className="truncate text-sm font-semibold text-foreground">{entry.displayName}</div>
                        </div>
                        <Button
                          variant="secondary"
                          size="xs"
                          disabled={draftRivalIds.length >= RIVAL_LIMIT || saving}
                          onClick={() => addRival(entry.id)}
                        >
                          Add
                        </Button>
                      </div>
                    </RowShellV2>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="grid grid-cols-2 gap-2 px-4 py-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={!hasChanges} loading={saving}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function CompanionHomePage() {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const { showToast } = useToast()
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'
  const now = useNow({ tickMs: 60_000 })
  const phaseState = useTournamentPhaseState()
  const viewerId = useViewerId()
  const picksState = usePicksData()
  const snapshot = usePublishedSnapshot()
  const knockoutData = useBracketKnockoutData()

  const [profileState, setProfileState] = useState<HomeProfileState>({
    status: 'loading',
    favoriteTeamCode: null,
    rivalUserIds: [],
    rivalDirectory: [],
    message: null
  })
  const [favoriteSheetOpen, setFavoriteSheetOpen] = useState(false)
  const [rivalsSheetOpen, setRivalsSheetOpen] = useState(false)
  const [favoriteSaving, setFavoriteSaving] = useState(false)
  const [rivalsSaving, setRivalsSaving] = useState(false)

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches, isDemoMode ? { nowOverride: now } : undefined)
  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const memberId = (currentUser?.id ?? viewerId).trim()

  useEffect(() => {
    let canceled = false

    async function loadProfileState() {
      if (!memberId) {
        setProfileState({
          status: 'ready',
          favoriteTeamCode: null,
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

        setProfileState({
          status: 'ready',
          favoriteTeamCode: normalizeFavoriteTeamCode(profile.favoriteTeamCode),
          rivalUserIds: resolveCanonicalRivalIds(profile.rivalUserIds, viewerId, directory),
          rivalDirectory: directory,
          message: null
        })
      } catch (error) {
        if (canceled) return
        setProfileState({
          status: 'error',
          favoriteTeamCode: null,
          rivalUserIds: [],
          rivalDirectory: [],
          message: error instanceof Error ? error.message : 'Unable to load profile settings.'
        })
      }
    }

    void loadProfileState()

    return () => {
      canceled = true
    }
  }, [authState.user?.email, memberId, mode, viewerId])

  const timeline = useMemo(
    () =>
      computeMatchTimelineModel(matches, now.toISOString(), {
        matchPicksEditable: phaseState.lockFlags.matchPicksEditable
      }),
    [matches, now, phaseState.lockFlags.matchPicksEditable]
  )

  const editableMatches = useMemo(
    () => timeline.upcoming.filter((item) => item.editable),
    [timeline.upcoming]
  )

  const pendingMatchEdits = useMemo(() => {
    return editableMatches.reduce((count, item) => {
      const pick = findPick(picksState.picks, item.match.id, viewerId)
      return count + (isPickComplete(item.match, pick) ? 0 : 1)
    }, 0)
  }, [editableMatches, picksState.picks, viewerId])

  const groupSummary = useMemo(() => {
    let groupsDone = 0

    for (const groupId of groupStage.groupIds) {
      const group = groupStage.data.groups[groupId]
      const teamCodes = groupTeams[groupId] ?? []
      if (teamCodes.length > 0 && isStrictGroupRanking(group?.ranking, teamCodes)) groupsDone += 1
    }

    const bestThirdDone = groupStage.data.bestThirds.filter((code) => Boolean(String(code ?? '').trim())).length
    const pending = Math.max(0, groupStage.groupIds.length - groupsDone) + Math.max(0, BEST_THIRD_TARGET - bestThirdDone)

    return {
      groupsDone,
      groupsTotal: groupStage.groupIds.length,
      bestThirdDone,
      pending
    }
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds, groupTeams])

  const drawConfirmed =
    phaseState.tournamentPhase === 'KO_OPEN' ||
    phaseState.tournamentPhase === 'KO_LOCKED' ||
    phaseState.tournamentPhase === 'FINAL'

  const knockoutTotal = knockoutData.totalMatches
  const knockoutComplete = knockoutData.completeMatches

  const nextKickoff = timeline.upcoming.find((item) => item.normalizedStatus === 'scheduled')?.match.kickoffUtc ?? null
  const liveCount = timeline.upcoming.filter((item) => item.normalizedStatus === 'live').length

  const snapshotTimestamp =
    snapshot.state.status === 'ready'
      ? snapshot.state.snapshotTimestamp
      : picksState.state.status === 'ready'
        ? picksState.state.lastUpdated
        : null

  const favoriteTeamCode = useMemo(() => {
    if (profileState.favoriteTeamCode) return profileState.favoriteTeamCode
    return normalizeFavoriteTeamCode(currentUser?.favoriteTeamCode)
  }, [currentUser?.favoriteTeamCode, profileState.favoriteTeamCode])

  const favoriteTeamMeta = useMemo(
    () =>
      resolveTeamFlagMeta({
        code: favoriteTeamCode,
        name: TEAM_OPTIONS.find((entry) => entry.code === favoriteTeamCode)?.name ?? null,
        label: favoriteTeamCode ? 'Favorite team' : 'No favorite team selected'
      }),
    [favoriteTeamCode]
  )

  const presentationRows = useMemo(() => {
    if (snapshot.state.status !== 'ready') return [] as LeaderboardEntry[]
    return buildLeaderboardPresentation({
      snapshotTimestamp: snapshot.state.snapshotTimestamp,
      groupStageComplete: snapshot.state.groupStageComplete,
      projectedGroupStagePointsByUser: snapshot.state.projectedGroupStagePointsByUser,
      leaderboardRows: snapshot.state.leaderboardRows
    }).rows
  }, [snapshot.state])

  const rivalComparisonIdentities = useMemo(
    () => buildRivalComparisonIdentities(profileState.rivalUserIds, profileState.rivalDirectory),
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

  const rankedSnapshotRows = useMemo(() => {
    const rows = tieRanked.sortedRows
    const rankByKey = new Map<string, number>()
    const tieCountByPoints = new Map<number, number>()

    for (const { row, rank } of tieRanked.rankedRows) {
      const idKey = normalizeKey(row.member.id)
      if (idKey && !rankByKey.has(`id:${idKey}`)) rankByKey.set(`id:${idKey}`, rank)
      const emailKey = normalizeKey(row.member.email)
      if (emailKey && !rankByKey.has(`email:${emailKey}`)) rankByKey.set(`email:${emailKey}`, rank)
      const nameKey = normalizeKey(row.member.name)
      if (nameKey && !rankByKey.has(`name:${nameKey}`)) rankByKey.set(`name:${nameKey}`, rank)
    }

    for (const entry of rows) {
      tieCountByPoints.set(entry.totalPoints, (tieCountByPoints.get(entry.totalPoints) ?? 0) + 1)
    }

    return rows.map((entry, index) => {
      const idKey = normalizeKey(entry.member.id)
      const emailKey = normalizeKey(entry.member.email)
      const nameKey = normalizeKey(entry.member.name)
      const rank =
        (idKey ? rankByKey.get(`id:${idKey}`) : undefined) ??
        (emailKey ? rankByKey.get(`email:${emailKey}`) : undefined) ??
        (nameKey ? rankByKey.get(`name:${nameKey}`) : undefined) ??
        index + 1

      return {
        entry,
        rank,
        tieCount: tieCountByPoints.get(entry.totalPoints) ?? 1,
        points: Number.isFinite(entry.totalPoints) ? entry.totalPoints : 0
      } satisfies RankedSnapshotRow
    })
  }, [tieRanked.rankedRows, tieRanked.sortedRows])

  const rivalStandingById = useMemo(() => {
    const map = new Map<string, RivalStanding>()

    for (const rivalId of profileState.rivalUserIds) {
      const directoryEntry = profileState.rivalDirectory.find((entry) => normalizeKey(entry.id) === normalizeKey(rivalId))
      const identityKeys = buildViewerKeySet([
        rivalId,
        directoryEntry?.id ?? null,
        directoryEntry?.displayName ?? null,
        directoryEntry?.email ?? null
      ])

      const rankedRow = rankedSnapshotRows.find((row) =>
        resolveLeaderboardIdentityKeys(row.entry).some((identity) => identityKeys.has(normalizeKey(identity)))
      )

      map.set(rivalId, {
        rivalId,
        displayName: directoryEntry?.displayName ?? rivalId,
        favoriteTeamCode: normalizeFavoriteTeamCode(directoryEntry?.favoriteTeamCode),
        rankLabel: rankedRow ? formatRankLabel(rankedRow.rank, rankedRow.tieCount) : 'Unranked',
        pointsLabel: rankedRow ? `${rankedRow.points} pts` : '— pts'
      })
    }

    return map
  }, [profileState.rivalDirectory, profileState.rivalUserIds, rankedSnapshotRows])

  const rivalRows = useMemo(() => {
    return profileState.rivalUserIds.map((rivalId, index) => {
      const standing = rivalStandingById.get(rivalId)
      return {
        id: rivalId,
        slot: index + 1,
        displayName: standing?.displayName ?? rivalId,
        favoriteTeamCode: standing?.favoriteTeamCode ?? null,
        rankLabel: standing?.rankLabel ?? 'Unranked',
        pointsLabel: standing?.pointsLabel ?? '— pts'
      }
    })
  }, [profileState.rivalUserIds, rivalStandingById])

  async function saveFavoriteTeam(nextFavoriteTeamCode: string | null) {
    if (!memberId) return
    setFavoriteSaving(true)
    try {
      await writeUserProfile(mode, memberId, { favoriteTeamCode: nextFavoriteTeamCode }, authState.user?.email ?? null)
      setProfileState((current) => ({
        ...current,
        favoriteTeamCode: nextFavoriteTeamCode
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save favorite team right now.'
      showToast({ title: 'Save failed', message, tone: 'danger' })
      throw error
    } finally {
      setFavoriteSaving(false)
    }
  }

  async function saveRivalSelection(nextRivalIds: string[]) {
    if (!memberId) return
    setRivalsSaving(true)
    try {
      const sanitized = sanitizeRivalIds(nextRivalIds, viewerId, profileState.rivalDirectory)
      await writeUserProfile(mode, memberId, { rivalUserIds: sanitized }, authState.user?.email ?? null)
      setProfileState((current) => ({
        ...current,
        rivalUserIds: sanitized
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save rivals right now.'
      showToast({ title: 'Save failed', message, tone: 'danger' })
      throw error
    } finally {
      setRivalsSaving(false)
    }
  }

  return (
    <CompanionPageFrame title="Home">
      <SectionCardV2 tone="panel" density="none" withGlow={false} className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot: " />
          <StatusTagV2 tone="secondary">{phaseState.tournamentPhase.replace('_', ' ')}</StatusTagV2>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Pending picks</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{pendingMatchEdits}</div>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Live</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{liveCount}</div>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Editable</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{editableMatches.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Next lock</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{formatKickoff(nextKickoff)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CompanionButtonLink to="/m/picks" size="sm" variant="primary">
            {pendingMatchEdits > 0 ? 'Continue picks' : 'Open picks'}
          </CompanionButtonLink>
          <CompanionButtonLink to="/m/leaderboard" size="sm" variant="secondary">
            League
          </CompanionButtonLink>
        </div>
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" withGlow={false} className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Favorite team</div>
          <Button size="xs" variant="quiet" onClick={() => setFavoriteSheetOpen(true)}>Edit</Button>
        </div>

        {profileState.status === 'error' ? (
          <StatusCopy>{profileState.message ?? 'Unable to load profile settings.'}</StatusCopy>
        ) : (
          <RowShellV2 depth="embedded" interactive={false} className="px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <FlagBadgeV2
                  src={favoriteTeamMeta.assetPath}
                  fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                  size="sm"
                  className="overflow-hidden rounded-md"
                />
                <div className="truncate text-sm font-semibold text-foreground">
                  {favoriteTeamCode ? (
                    <>
                      {favoriteTeamCode}
                      <span className="ml-1 text-muted-foreground">
                        {TEAM_OPTIONS.find((entry) => entry.code === favoriteTeamCode)?.name}
                      </span>
                    </>
                  ) : (
                    'No favorite team selected'
                  )}
                </div>
              </div>
            </div>
          </RowShellV2>
        )}
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" withGlow={false} className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Rivals</div>
          <div className="flex items-center gap-2">
            <span className="v2-type-caption">{`Following ${profileState.rivalUserIds.length}/${RIVAL_LIMIT} rivals`}</span>
            <Button size="xs" variant="quiet" onClick={() => setRivalsSheetOpen(true)}>Edit</Button>
          </div>
        </div>

        {profileState.status === 'loading' ? (
          <StatusCopy>Loading rivals…</StatusCopy>
        ) : profileState.status === 'error' ? (
          <StatusCopy>{profileState.message ?? 'Unable to load rivals right now.'}</StatusCopy>
        ) : rivalRows.length === 0 ? (
          <StatusCopy>No rivals selected.</StatusCopy>
        ) : (
          <div className="space-y-1.5">
            {rivalRows.map((rival) => {
              const rivalMeta = resolveTeamFlagMeta({
                code: rival.favoriteTeamCode,
                name: rival.displayName,
                label: rival.displayName
              })

              return (
                <RowShellV2 key={rival.id} depth="embedded" state="rival" interactive={false} className="px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <FlagBadgeV2
                        src={rivalMeta.assetPath}
                        fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                        size="sm"
                        className="overflow-hidden rounded-md"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{rival.displayName}</div>
                        <div className="v2-type-caption">{`${rival.rankLabel} • ${rival.pointsLabel}`}</div>
                      </div>
                    </div>
                    <StatusTagV2 tone="rival">R{rival.slot}</StatusTagV2>
                  </div>
                </RowShellV2>
              )
            })}
          </div>
        )}
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" withGlow={false} className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Group Stage</div>
          <StatusTagV2 tone={groupSummary.pending > 0 ? 'warning' : 'success'}>
            {groupSummary.pending > 0 ? `${groupSummary.pending} pending` : 'Complete'}
          </StatusTagV2>
        </div>

        {groupStage.loadState.status === 'loading' ? (
          <StatusCopy>Syncing group stage status…</StatusCopy>
        ) : groupStage.loadState.status === 'error' ? (
          <StatusCopy>{groupStage.loadState.message}</StatusCopy>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Groups</div>
              <div className="font-semibold text-foreground">{groupSummary.groupsDone}/{groupSummary.groupsTotal}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Best 3rd</div>
              <div className="font-semibold text-foreground">{groupSummary.bestThirdDone}/{BEST_THIRD_TARGET}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Status</div>
              <div className="font-semibold text-foreground">{groupStage.isLocked ? 'Locked' : 'Open'}</div>
            </div>
          </div>
        )}

        <StatusCopy>Set group rankings on web. Use companion for quick picks and standings.</StatusCopy>
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" withGlow={false} className="space-y-3 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Knockout Bracket</div>
          <StatusTagV2 tone={!drawConfirmed ? 'warning' : phaseState.lockFlags.bracketEditable ? 'info' : 'locked'}>
            {!drawConfirmed ? 'Not open' : phaseState.lockFlags.bracketEditable ? 'Open' : 'Locked'}
          </StatusTagV2>
        </div>

        {knockoutData.loadState.status === 'loading' ? (
          <StatusCopy>Syncing knockout bracket status…</StatusCopy>
        ) : knockoutData.loadState.status === 'error' ? (
          <StatusCopy>{knockoutData.loadState.message}</StatusCopy>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Picks</div>
              <div className="font-semibold text-foreground">{knockoutComplete}/{knockoutTotal}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Draw</div>
              <div className="font-semibold text-foreground">{drawConfirmed ? 'Confirmed' : 'Pending'}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Phase</div>
              <div className="font-semibold text-foreground">{formatKnockoutPhaseLabel(phaseState.tournamentPhase)}</div>
            </div>
          </div>
        )}

        <StatusCopy>Set knockout winners on web. Use companion for quick picks and standings.</StatusCopy>
      </SectionCardV2>

      <FavoriteTeamSheet
        open={favoriteSheetOpen}
        onOpenChange={setFavoriteSheetOpen}
        favoriteTeamCode={favoriteTeamCode}
        onSave={saveFavoriteTeam}
        saving={favoriteSaving}
      />

      <ManageRivalsSheet
        open={rivalsSheetOpen}
        onOpenChange={setRivalsSheetOpen}
        rivalUserIds={profileState.rivalUserIds}
        rivalDirectory={profileState.rivalDirectory}
        viewerId={viewerId}
        rivalStandingById={rivalStandingById}
        onSave={saveRivalSelection}
        saving={rivalsSaving}
      />
    </CompanionPageFrame>
  )
}

export function CompanionPicksPage() {
  return (
    <CompanionPageFrame title="Picks">
      <CompanionPredictionsContent />
    </CompanionPageFrame>
  )
}

export function CompanionLeaderboardPage() {
  return (
    <CompanionPageFrame title="League">
      <CompanionLeaderboardContent />
    </CompanionPageFrame>
  )
}
