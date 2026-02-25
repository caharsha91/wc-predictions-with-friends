import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { areMatchesCompleted, isMatchCompleted } from '../../lib/matchStatus'
import { getPickOutcome, getPredictedWinner, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickAdvances } from '../../types/picks'
import type { KnockoutStage, ScoringConfig, StageScoring } from '../../types/scoring'
import type { LeaderboardCardRow } from '../components/v2/LeaderboardSideListV2'
import { Alert } from '../components/ui/Alert'
import { Button, ButtonLink } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import { LeaderboardCardCurated, RightRailSticky } from '../components/v2/LeaderboardSideListV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import RowShellV2 from '../components/v2/RowShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import StatusTagV2 from '../components/v2/StatusTagV2'
import TeamIdentityInlineV2 from '../components/v2/TeamIdentityInlineV2'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useFavoriteTeamPreference } from '../context/FavoriteTeamPreferenceContext'
import { useAuthState } from '../hooks/useAuthState'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { buildViewerKeySet, resolveLeaderboardIdentityKeys } from '../lib/leaderboardContext'
import { rankRowsWithTiePriority } from '../lib/leaderboardTieRanking'
import {
  computeMatchTimelineModel,
  type MatchReadOnlyReason,
  type MatchTimelineItem
} from '../lib/matchTimeline'
import {
  fetchRivalDirectory,
  readUserProfile,
  type RivalDirectoryEntry
} from '../lib/profilePersistence'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { normalizeFavoriteTeamCode } from '../lib/teamFlag'

type KoWinMethod = 'ET' | 'PENS'

type MatchDraft = {
  homeScore: string
  awayScore: string
  eventualWinnerTeamId: '' | PickAdvances
  koWinMethod: '' | KoWinMethod
}

type ScoringState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; scoring: ScoringConfig }

type PickPoints = {
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  total: number
}

type PredictionResult = 'correct' | 'wrong' | 'pending'

type MatchRowProps = {
  item: MatchTimelineItem
  draft: MatchDraft
  rowDirty: boolean
  rowError?: string
  isSaving: boolean
  isSaved: boolean
  onHomeScoreChange: (value: string) => void
  onAwayScoreChange: (value: string) => void
  onWinnerChange: (value: '' | PickAdvances) => void
  onKoMethodChange: (value: '' | KoWinMethod) => void
  onSave: () => void
}

type ResultRowProps = {
  item: MatchTimelineItem
  pick?: Pick
  scoring: ScoringConfig | null
}

type ResultsTableProps = {
  items: MatchTimelineItem[]
  picksByMatchId: Map<string, Pick>
  scoring: ScoringConfig | null
  emptyMessage: string
}

const EMPTY_MATCHES: Match[] = []
const UPCOMING_DISPLAY_WINDOW_MS = 48 * 60 * 60 * 1000
const MAX_RECENT_RESULTS = 5
const KO_EXTRAS_LANE_MIN_HEIGHT_CLASS = 'min-h-[74px] md:min-h-[44px]'

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeKey(viewerId)
  const seen = new Set<string>()
  const next: string[] = []

  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    if (!trimmed) continue
    const key = normalizeKey(trimmed)
    if (!key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
    if (next.length >= 3) break
  }

  return next
}

function formatKickoff(utcIso: string): string {
  const timestamp = new Date(utcIso).getTime()
  if (!Number.isFinite(timestamp)) return 'Kickoff unavailable'
  return new Date(utcIso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatKoWinMethodLabel(value: string | undefined): string {
  if (value === 'ET') return 'AET'
  if (value === 'PENS') return 'Pens'
  return 'Not set'
}

function readOnlyReasonLabel(reason: MatchReadOnlyReason): string {
  if (reason === 'global-lock') return 'Locked by tournament phase.'
  if (reason === 'outside-window') return 'Outside editable 48-hour window.'
  if (reason === 'in-progress') return 'Live matches are read-only.'
  if (reason === 'missing-kickoff') return 'Kickoff unavailable.'
  return 'Read-only.'
}

function parseScore(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!/^\d+$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.floor(parsed))
}

function kickoffSortMs(item: MatchTimelineItem): number {
  if (typeof item.kickoffMs === 'number' && Number.isFinite(item.kickoffMs)) return item.kickoffMs
  const parsedKickoff = new Date(item.match.kickoffUtc).getTime()
  if (Number.isFinite(parsedKickoff)) return parsedKickoff
  return item.sortMs
}

function sortByKickoffLatestFirst(left: MatchTimelineItem, right: MatchTimelineItem): number {
  const kickoffDelta = kickoffSortMs(right) - kickoffSortMs(left)
  if (kickoffDelta !== 0) return kickoffDelta
  return right.sortMs - left.sortMs
}

function segmentedButtonClass(selected: boolean): string {
  return [
    'inline-flex h-7 min-w-0 items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    selected
      ? 'border-[color:var(--v2-row-active-border)] bg-[var(--accent-soft)] text-foreground shadow-[var(--shadow0)]'
      : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/60 hover:text-foreground'
  ].join(' ')
}

function toDraft(pick?: Pick): MatchDraft {
  return {
    homeScore: typeof pick?.homeScore === 'number' ? String(pick.homeScore) : '',
    awayScore: typeof pick?.awayScore === 'number' ? String(pick.awayScore) : '',
    eventualWinnerTeamId: pick?.advances ?? '',
    koWinMethod: pick?.decidedBy === 'ET' || pick?.decidedBy === 'PENS' ? pick.decidedBy : ''
  }
}

function isDraftDirty(current: MatchDraft, baseline: MatchDraft): boolean {
  return (
    current.homeScore !== baseline.homeScore ||
    current.awayScore !== baseline.awayScore ||
    current.eventualWinnerTeamId !== baseline.eventualWinnerTeamId ||
    current.koWinMethod !== baseline.koWinMethod
  )
}

function resolvePredictedLabel(pick?: Pick): string {
  if (!pick) return 'No pick yet'
  const hasScores = typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number'
  if (!hasScores) return 'No pick yet'
  const base = `${pick.homeScore}-${pick.awayScore}`
  if (pick.homeScore !== pick.awayScore) return base
  const winner = pick.advances === 'HOME' || pick.advances === 'AWAY' ? pick.advances : null
  const method = formatKoWinMethodLabel(pick.decidedBy)
  return winner ? `${base} (${winner}, ${method})` : `${base} (${method})`
}

function resolveActualLabel(match: Match): string {
  if (!match.score) return '—'
  const base = `${match.score.home}-${match.score.away}`
  if (!match.winner) return base
  const winnerCode = match.winner === 'HOME' ? match.homeTeam.code : match.awayTeam.code
  return `${base} (${winnerCode})`
}

function resolveWinnerTeamCode(match: Match, winnerSide?: PickAdvances): string {
  if (winnerSide === 'HOME') return match.homeTeam.code
  if (winnerSide === 'AWAY') return match.awayTeam.code
  return ''
}

function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
}

function downloadCsvFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function getActualOutcome(match: Match): 'WIN' | 'LOSS' | 'DRAW' | undefined {
  if (!match.score) return undefined
  if (match.score.home > match.score.away) return 'WIN'
  if (match.score.home < match.score.away) return 'LOSS'
  return 'DRAW'
}

function resolveStageConfig(match: Match, scoring: ScoringConfig): StageScoring {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function scoreMatchPick(match: Match, pick: Pick | undefined, scoring: ScoringConfig): PickPoints {
  if (!pick || !match.score || !isMatchCompleted(match)) {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, total: 0 }
  }

  if (!isPickComplete(match, pick)) {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, total: 0 }
  }

  const config = resolveStageConfig(match, scoring)
  let exactPoints = 0
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    if (pick.homeScore === match.score.home && pick.awayScore === match.score.away) {
      exactPoints = config.exactScoreBoth
    } else if (pick.homeScore === match.score.home || pick.awayScore === match.score.away) {
      exactPoints = config.exactScoreOne
    }
  }

  const predictedOutcome = getPickOutcome(pick)
  const actualOutcome = getActualOutcome(match)
  const resultPoints = predictedOutcome && predictedOutcome === actualOutcome ? config.result : 0

  let knockoutPoints = 0
  if (match.stage !== 'Group' && match.winner && (match.decidedBy === 'ET' || match.decidedBy === 'PENS')) {
    const predictedWinner = getPredictedWinner(pick)
    if (predictedWinner && predictedWinner === match.winner) {
      knockoutPoints = config.knockoutWinner ?? 0
    }
  }

  return {
    exactPoints,
    resultPoints,
    knockoutPoints,
    total: exactPoints + resultPoints + knockoutPoints
  }
}

function getPredictionResult(match: Match, pick: Pick | undefined): PredictionResult {
  if (!isMatchCompleted(match) || !match.score) return 'pending'
  if (!pick || !isPickComplete(match, pick)) return 'wrong'

  if (match.stage === 'Group') {
    const predicted = getPickOutcome(pick)
    const actual = getActualOutcome(match)
    if (!predicted || !actual) return 'wrong'
    return predicted === actual ? 'correct' : 'wrong'
  }

  if (!match.winner) return 'pending'
  const predictedWinner = getPredictedWinner(pick)
  if (!predictedWinner) return 'wrong'
  return predictedWinner === match.winner ? 'correct' : 'wrong'
}

function resultTone(status: PredictionResult): 'success' | 'danger' | 'secondary' {
  if (status === 'correct') return 'success'
  if (status === 'wrong') return 'danger'
  return 'secondary'
}

function resultLabel(status: PredictionResult): string {
  if (status === 'correct') return 'Correct'
  if (status === 'wrong') return 'Wrong'
  return 'Pending'
}

function formatPointsLabel(points: number): string {
  if (points > 0) return `+${points} pts`
  return `${points} pts`
}

function MatchRow({
  item,
  draft,
  rowDirty,
  rowError,
  isSaving,
  isSaved,
  onHomeScoreChange,
  onAwayScoreChange,
  onWinnerChange,
  onKoMethodChange,
  onSave
}: MatchRowProps) {
  const match = item.match
  const parsedHome = parseScore(draft.homeScore)
  const parsedAway = parseScore(draft.awayScore)
  const hasScores = parsedHome !== undefined && parsedAway !== undefined
  const isKnockout = match.stage !== 'Group'
  const predictedDraw = hasScores && parsedHome === parsedAway
  const requiresKoExtras = isKnockout && predictedDraw
  const hasKoWinner = draft.eventualWinnerTeamId === 'HOME' || draft.eventualWinnerTeamId === 'AWAY'
  const hasKoMethod = draft.koWinMethod === 'ET' || draft.koWinMethod === 'PENS'
  const validForSave = hasScores && (!requiresKoExtras || (hasKoWinner && hasKoMethod))
  const canSave = item.editable && rowDirty && validForSave && !isSaving
  const stageLabel = match.group ? `Group ${match.group}` : match.stage
  const kickoffLabel = formatKickoff(match.kickoffUtc)
  const rowState = !item.editable ? 'disabled' : rowDirty ? 'selected' : 'default'
  const showKoExtras = item.editable && requiresKoExtras

  return (
    <RowShellV2 state={rowState} className="px-2.5 py-2">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <TeamIdentityInlineV2 code={match.homeTeam.code} name={match.homeTeam.name} size="sm" />
            <span className="shrink-0 text-muted-foreground">vs</span>
            <TeamIdentityInlineV2 code={match.awayTeam.code} name={match.awayTeam.name} size="sm" />
            <span className="hidden shrink-0 text-[11px] font-normal text-muted-foreground md:inline">·</span>
            <span className="hidden truncate text-[11px] font-normal text-muted-foreground md:inline">
              {stageLabel} · {kickoffLabel}
            </span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground md:hidden">
            {stageLabel} · {kickoffLabel}
          </div>
        </div>

        <div className="flex items-center justify-start gap-1.5 md:justify-center">
          <Input
            id={`score-home-${match.id}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.homeScore}
            onChange={(event) => onHomeScoreChange(event.target.value)}
            disabled={!item.editable || isSaving}
            className="h-8 w-14 px-1.5 py-1 text-center text-[13px] tabular-nums"
            aria-label={`${match.homeTeam.code} score`}
          />
          <span className="text-xs text-muted-foreground">-</span>
          <Input
            id={`score-away-${match.id}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.awayScore}
            onChange={(event) => onAwayScoreChange(event.target.value)}
            disabled={!item.editable || isSaving}
            className="h-8 w-14 px-1.5 py-1 text-center text-[13px] tabular-nums"
            aria-label={`${match.awayTeam.code} score`}
          />
        </div>

        <div className="flex min-h-8 items-center justify-start md:justify-end">
          {item.editable && rowDirty ? (
            <Button
              size="sm"
              className="h-8 rounded-lg px-3 text-[12px]"
              onClick={onSave}
              disabled={!canSave}
              loading={isSaving}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>

      <div className={`mt-1.5 ${KO_EXTRAS_LANE_MIN_HEIGHT_CLASS}`}>
        {showKoExtras ? (
          <div className="grid h-full content-center gap-1.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Winner</span>
              <div className="inline-flex min-w-0 flex-1 items-center rounded-lg border border-border/70 bg-background/55 p-0.5">
                <button
                  type="button"
                  className={`${segmentedButtonClass(draft.eventualWinnerTeamId === 'HOME')} flex-1`}
                  onClick={() => onWinnerChange('HOME')}
                  disabled={!item.editable || isSaving}
                  aria-label={`Set ${match.homeTeam.code} as eventual winner`}
                  aria-pressed={draft.eventualWinnerTeamId === 'HOME'}
                >
                  <TeamIdentityInlineV2
                    code={match.homeTeam.code}
                    name={match.homeTeam.name}
                    className="max-w-[6.5rem]"
                    size="sm"
                  />
                </button>
                <button
                  type="button"
                  className={`${segmentedButtonClass(draft.eventualWinnerTeamId === 'AWAY')} flex-1`}
                  onClick={() => onWinnerChange('AWAY')}
                  disabled={!item.editable || isSaving}
                  aria-label={`Set ${match.awayTeam.code} as eventual winner`}
                  aria-pressed={draft.eventualWinnerTeamId === 'AWAY'}
                >
                  <TeamIdentityInlineV2
                    code={match.awayTeam.code}
                    name={match.awayTeam.name}
                    className="max-w-[6.5rem]"
                    size="sm"
                  />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Decided in</span>
              <div className="inline-flex items-center rounded-lg border border-border/70 bg-background/55 p-0.5">
                <button
                  type="button"
                  className={segmentedButtonClass(draft.koWinMethod === 'ET')}
                  onClick={() => onKoMethodChange('ET')}
                  disabled={!item.editable || isSaving}
                  aria-label="Set match decided in AET"
                  aria-pressed={draft.koWinMethod === 'ET'}
                >
                  AET
                </button>
                <button
                  type="button"
                  className={segmentedButtonClass(draft.koWinMethod === 'PENS')}
                  onClick={() => onKoMethodChange('PENS')}
                  disabled={!item.editable || isSaving}
                  aria-label="Set match decided in penalties"
                  aria-pressed={draft.koWinMethod === 'PENS'}
                >
                  PEN
                </button>
              </div>
            </div>
          </div>
        ) : item.editable ? (
          <div aria-hidden="true" className="h-full rounded-md border border-transparent" />
        ) : (
          <div className="flex h-full items-center truncate text-[11px] text-muted-foreground">
            {readOnlyReasonLabel(item.readOnlyReason)}
          </div>
        )}
      </div>

      {rowError ? (
        <div className="mt-1 text-[11px] text-destructive">
          {rowError}
        </div>
      ) : null}
    </RowShellV2>
  )
}

function ResultRow({ item, pick, scoring }: ResultRowProps) {
  const match = item.match
  const outcome = getPredictionResult(match, pick)
  const points = scoring && isMatchCompleted(match) ? scoreMatchPick(match, pick, scoring).total : null
  const stageLabel = match.group ? `Group ${match.group}` : match.stage

  return (
    <tr>
      <td>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <TeamIdentityInlineV2 code={match.homeTeam.code} name={match.homeTeam.name} />
            <span className="shrink-0 text-muted-foreground">vs</span>
            <TeamIdentityInlineV2 code={match.awayTeam.code} name={match.awayTeam.name} />
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {stageLabel} · {formatKickoff(match.kickoffUtc)}
          </div>
        </div>
      </td>
      <td className="text-[13px] tabular-nums">{resolvePredictedLabel(pick)}</td>
      <td className="text-[13px] tabular-nums">{resolveActualLabel(match)}</td>
      <td>
        <StatusTagV2 tone={resultTone(outcome)}>
          {resultLabel(outcome)}
        </StatusTagV2>
      </td>
      <td className="text-right text-[13px] font-semibold tabular-nums text-foreground">
        {points === null ? '—' : formatPointsLabel(points)}
      </td>
    </tr>
  )
}

function ResultsTable({ items, picksByMatchId, scoring, emptyMessage }: ResultsTableProps) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">{emptyMessage}</div>
  }

  return (
    <Table
      unframed
      className="[&_th]:h-8 [&_th]:px-2 [&_th]:py-0 [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-[0.14em] [&_th]:text-muted-foreground [&_td]:h-10 [&_td]:px-2 [&_td]:py-1.5"
    >
      <thead>
        <tr>
          <th>Match</th>
          <th>Your pick</th>
          <th>Actual</th>
          <th>Outcome</th>
          <th className="text-right">Points</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <ResultRow key={item.match.id} item={item} pick={picksByMatchId.get(item.match.id)} scoring={scoring} />
        ))}
      </tbody>
    </Table>
  )
}

export default function PicksPage() {
  const location = useLocation()
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const currentUser = useCurrentUser()
  const favoriteTeamPreference = useFavoriteTeamPreference()
  const authState = useAuthState()
  const now = useNow({ tickMs: 300_000 })
  const isDesktopViewport = useMediaQuery('(min-width: 1024px)')
  const picksState = usePicksData()
  const publishedSnapshot = usePublishedSnapshot()
  const phaseState = useTournamentPhaseState()
  const { showToast } = useToast()

  const [leaguePeekOpen, setLeaguePeekOpen] = useState(false)
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null)
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null)
  const [draftByMatchId, setDraftByMatchId] = useState<Record<string, MatchDraft>>({})
  const [rowErrorByMatchId, setRowErrorByMatchId] = useState<Record<string, string>>({})
  const [scoringState, setScoringState] = useState<ScoringState>({ status: 'loading' })
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const [profileFavoriteTeamCode, setProfileFavoriteTeamCode] = useState<string | null>(null)
  const [rivalDirectoryEntries, setRivalDirectoryEntries] = useState<RivalDirectoryEntry[]>([])
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
  const viewerFavoriteTeamCode = useMemo(
    () =>
      normalizeFavoriteTeamCode(
        favoriteTeamPreference.favoriteTeamCode ?? profileFavoriteTeamCode ?? currentUser?.favoriteTeamCode
      ),
    [currentUser?.favoriteTeamCode, favoriteTeamPreference.favoriteTeamCode, profileFavoriteTeamCode]
  )

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES

  useEffect(() => {
    let canceled = false

    async function loadScoring() {
      setScoringState({ status: 'loading' })
      try {
        const scoring = await fetchScoring({ mode })
        if (!canceled) setScoringState({ status: 'ready', scoring })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setScoringState({ status: 'error', message })
      }
    }

    void loadScoring()
    return () => {
      canceled = true
    }
  }, [mode])

  useEffect(() => {
    let canceled = false

    async function loadProfile() {
      try {
        const profile = await readUserProfile(mode, viewerId, authState.user?.email ?? null)
        if (canceled) return
        setRivalUserIds(sanitizeRivalUserIds(profile.rivalUserIds, viewerId))
        setProfileFavoriteTeamCode(normalizeFavoriteTeamCode(profile.favoriteTeamCode))
      } catch {
        if (canceled) return
        setRivalUserIds([])
        setProfileFavoriteTeamCode(null)
      }
    }

    void loadProfile()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, mode, viewerId])

  useEffect(() => {
    let canceled = false

    async function loadRivalDirectory() {
      try {
        const entries = await fetchRivalDirectory(mode, viewerId, authState.user?.email ?? null)
        if (canceled) return
        setRivalDirectoryEntries(entries)
      } catch {
        if (canceled) return
        setRivalDirectoryEntries([])
      }
    }

    void loadRivalDirectory()
    return () => {
      canceled = true
    }
  }, [authState.user?.email, mode, viewerId])

  useEffect(() => {
    if (!savedMatchId) return
    const timeout = window.setTimeout(() => {
      setSavedMatchId((current) => (current === savedMatchId ? null : current))
    }, 1800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [savedMatchId])

  const timelineModel = useMemo(
    () =>
      computeMatchTimelineModel(matches, now.toISOString(), {
        matchPicksEditable: phaseState.lockFlags.matchPicksEditable
      }),
    [matches, now, phaseState.lockFlags.matchPicksEditable]
  )

  const upcomingDisplayMatches = useMemo(() => {
    const editableUpcoming = timelineModel.upcoming.filter((item) => item.editable && item.kickoffMs !== null)
    if (editableUpcoming.length === 0) return []

    const nowMs = now.getTime()
    const nowWindowEndMs = nowMs + UPCOMING_DISPLAY_WINDOW_MS
    const next48Hours = editableUpcoming.filter((item) => {
      const kickoffMs = item.kickoffMs
      return kickoffMs !== null && kickoffMs >= nowMs && kickoffMs <= nowWindowEndMs
    })

    if (next48Hours.length > 0) return next48Hours

    const fallbackAnchorMs = editableUpcoming.reduce((current, item) => {
      const kickoffMs = item.kickoffMs
      if (kickoffMs === null) return current
      return kickoffMs < current ? kickoffMs : current
    }, Number.POSITIVE_INFINITY)

    if (!Number.isFinite(fallbackAnchorMs)) return []

    const fallbackWindowEndMs = fallbackAnchorMs + UPCOMING_DISPLAY_WINDOW_MS
    return editableUpcoming.filter((item) => {
      const kickoffMs = item.kickoffMs
      return kickoffMs !== null && kickoffMs >= fallbackAnchorMs && kickoffMs <= fallbackWindowEndMs
    })
  }, [timelineModel.upcoming, now])

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const isMatchPicksFinal = useMemo(() => areMatchesCompleted(matches), [matches])

  const rivalDirectoryByIdentity = useMemo(() => {
    const map = new Map<string, RivalDirectoryEntry>()
    for (const entry of rivalDirectoryEntries) {
      const idKey = normalizeKey(entry.id)
      const nameKey = normalizeKey(entry.displayName)
      const emailKey = normalizeKey(entry.email)
      if (idKey) {
        map.set(entry.id, entry)
        map.set(idKey, entry)
        map.set(`id:${idKey}`, entry)
      }
      if (nameKey) {
        map.set(entry.displayName, entry)
        map.set(nameKey, entry)
        map.set(`name:${nameKey}`, entry)
      }
      if (emailKey) {
        if (entry.email) map.set(entry.email, entry)
        map.set(emailKey, entry)
        map.set(`email:${emailKey}`, entry)
      }
    }
    return map
  }, [rivalDirectoryEntries])

  const resolveCardRowFavoriteTeamCode = useCallback(
    ({
      rowId,
      rowName,
      isYou
    }: {
      rowId: string
      rowName: string
      isYou: boolean
    }): string | null => {
      if (isYou) return viewerFavoriteTeamCode

      const idKey = normalizeKey(rowId)
      const nameKey = normalizeKey(rowName)
      const candidates = [
        idKey,
        idKey ? `id:${idKey}` : '',
        nameKey,
        nameKey ? `name:${nameKey}` : ''
      ].filter(Boolean)

      for (const candidate of candidates) {
        const match = rivalDirectoryByIdentity.get(candidate)
        if (!match) continue
        return normalizeFavoriteTeamCode(match.favoriteTeamCode)
      }

      return null
    },
    [rivalDirectoryByIdentity, viewerFavoriteTeamCode]
  )

  const leaderboardRowsForCard = useMemo<LeaderboardCardRow[]>(() => {
    if (!snapshotReady) return []
    const sectionRows = buildLeaderboardPresentation({
      snapshotTimestamp: snapshotReady.snapshotTimestamp,
      groupStageComplete: snapshotReady.groupStageComplete,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      leaderboardRows: snapshotReady.leaderboardRows
    }).rows.map((entry) => {
      const sectionPoints = entry.exactPoints + entry.resultPoints + entry.knockoutPoints
      const isYou = resolveLeaderboardIdentityKeys(entry).some((key) => viewerKeys.has(key))
      return {
        id: entry.member.id || entry.member.name,
        name: entry.member.name,
        points: sectionPoints,
        isYou,
        favoriteTeamCode: resolveCardRowFavoriteTeamCode({
          rowId: entry.member.id || entry.member.name,
          rowName: entry.member.name,
          isYou
        })
      }
    })

    const ranked = rankRowsWithTiePriority({
      rows: sectionRows,
      getPoints: (row) => row.points,
      getIdentityKeys: (row) => [row.id, `id:${row.id}`, row.name, `name:${row.name}`],
      getName: (row) => row.name,
      viewerIdentity: viewerId,
      rivalIdentities: rivalUserIds
    })

    return ranked.rankedRows.map(({ row, rank }) => ({
      id: row.id,
      name: row.name,
      rank,
      points: row.points,
      isYou: row.isYou,
      favoriteTeamCode: row.favoriteTeamCode ?? null
    }))
  }, [resolveCardRowFavoriteTeamCode, rivalUserIds, snapshotReady, viewerId, viewerKeys])

  const leaderboardPath = location.pathname.startsWith('/demo/') ? '/demo/leaderboard' : '/leaderboard'
  const homePath = mode === 'demo' ? '/demo' : '/'
  const leaderboardCardTitle = isMatchPicksFinal ? 'Final Leaderboard' : 'Projected Leaderboard'
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible
  const upcomingDisplayCount = upcomingDisplayMatches.length
  const scoring = scoringState.status === 'ready' ? scoringState.scoring : null
  const recentResultsOrdered = useMemo(
    () => [...timelineModel.recentResults].sort(sortByKickoffLatestFirst),
    [timelineModel.recentResults]
  )
  const recentResultsDisplay = useMemo(
    () => recentResultsOrdered.slice(0, MAX_RECENT_RESULTS),
    [recentResultsOrdered]
  )
  const olderResultsDisplay = useMemo(() => {
    const recentOverflow = recentResultsOrdered.slice(MAX_RECENT_RESULTS)
    if (recentOverflow.length === 0) return timelineModel.olderResults
    return [...recentOverflow, ...timelineModel.olderResults].sort(sortByKickoffLatestFirst)
  }, [recentResultsOrdered, timelineModel.olderResults])

  useEffect(() => {
    if (!isDesktopViewport) return
    setLeaguePeekOpen(false)
  }, [isDesktopViewport])

  const pickByMatchId = useMemo(() => {
    return new Map(
      picksState.picks
        .filter((pick) => pick.userId.trim().toLowerCase() === viewerId.trim().toLowerCase())
        .map((pick) => [pick.matchId, pick] as const)
    )
  }, [picksState.picks, viewerId])

  const clearRowError = useCallback((matchId: string) => {
    setRowErrorByMatchId((current) => {
      if (!current[matchId]) return current
      const next = { ...current }
      delete next[matchId]
      return next
    })
  }, [])

  const setRowError = useCallback((matchId: string, message: string) => {
    setRowErrorByMatchId((current) => ({ ...current, [matchId]: message }))
  }, [])

  const updateDraft = useCallback(
    (matchId: string, updater: (draft: MatchDraft) => MatchDraft) => {
      setDraftByMatchId((current) => ({
        ...current,
        [matchId]: updater(current[matchId] ?? toDraft(pickByMatchId.get(matchId)))
      }))
      clearRowError(matchId)
      setSavedMatchId((current) => (current === matchId ? null : current))
    },
    [clearRowError, pickByMatchId]
  )

  const handleDownloadMatchPicksCsv = useCallback(() => {
    const exportedAt = new Date().toISOString()
    const rows: string[][] = [
      ['exportedAt', exportedAt],
      ['snapshotAsOf', snapshotReady?.snapshotTimestamp ?? 'Snapshot unavailable'],
      ['viewerUserId', viewerId],
      ['mode', mode === 'demo' ? 'demo' : 'prod'],
      [],
      [
        'matchId',
        'stage',
        'kickoffUtc',
        'status',
        'homeTeamCode',
        'awayTeamCode',
        'homeScore',
        'awayScore',
        'eventualWinnerTeamId',
        'koWinMethod',
        'updatedAt'
      ]
    ]

    const sortedMatches = [...matches].sort((left, right) => new Date(left.kickoffUtc).getTime() - new Date(right.kickoffUtc).getTime())
    for (const match of sortedMatches) {
      const pick = pickByMatchId.get(match.id)
      if (!pick) continue
      rows.push([
        match.id,
        match.stage,
        match.kickoffUtc,
        match.status,
        match.homeTeam.code,
        match.awayTeam.code,
        typeof pick.homeScore === 'number' ? String(pick.homeScore) : '',
        typeof pick.awayScore === 'number' ? String(pick.awayScore) : '',
        resolveWinnerTeamCode(match, pick.advances),
        pick.decidedBy === 'ET' ? 'AET' : pick.decidedBy === 'PENS' ? 'Pens' : '',
        pick.updatedAt
      ])
    }

    const safeViewerId = viewerId.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const stamp = exportedAt.replace(/[:.]/g, '-')
    const fileName = `match-picks-${safeViewerId || 'viewer'}-${stamp}.csv`
    downloadCsvFile(fileName, rowsToCsv(rows))
  }, [matches, mode, pickByMatchId, snapshotReady?.snapshotTimestamp, viewerId])

  async function handleSaveMatch(item: MatchTimelineItem) {
    const match = item.match
    clearRowError(match.id)

    const existingPick = pickByMatchId.get(match.id)
    const draft = draftByMatchId[match.id] ?? toDraft(existingPick)
    const parsedHome = parseScore(draft.homeScore)
    const parsedAway = parseScore(draft.awayScore)

    if (parsedHome === undefined || parsedAway === undefined) {
      const message = 'Set both scores before saving.'
      setRowError(match.id, message)
      showToast({
        tone: 'warning',
        title: 'Scores required',
        message
      })
      return
    }

    const isKnockout = match.stage !== 'Group'
    const predictedDraw = parsedHome === parsedAway
    const requiresKoExtras = isKnockout && predictedDraw

    if (requiresKoExtras && !(draft.eventualWinnerTeamId === 'HOME' || draft.eventualWinnerTeamId === 'AWAY')) {
      const message = 'Pick the eventual winner for knockout draws.'
      setRowError(match.id, message)
      showToast({
        tone: 'warning',
        title: 'Winner required',
        message
      })
      return
    }

    if (requiresKoExtras && !(draft.koWinMethod === 'ET' || draft.koWinMethod === 'PENS')) {
      const message = 'Choose AET or Pens for knockout draws.'
      setRowError(match.id, message)
      showToast({
        tone: 'warning',
        title: 'Method required',
        message
      })
      return
    }

    setSavingMatchId(match.id)

    try {
      const eventualWinner =
        requiresKoExtras && (draft.eventualWinnerTeamId === 'HOME' || draft.eventualWinnerTeamId === 'AWAY')
          ? draft.eventualWinnerTeamId
          : undefined
      const koWinMethod =
        requiresKoExtras && (draft.koWinMethod === 'ET' || draft.koWinMethod === 'PENS')
          ? draft.koWinMethod
          : undefined

      const nextPicks = upsertPick(picksState.picks, {
        matchId: match.id,
        userId: viewerId,
        homeScore: parsedHome,
        awayScore: parsedAway,
        advances: eventualWinner,
        winner: eventualWinner,
        decidedBy: koWinMethod,
        outcome: undefined
      })

      picksState.updatePicks(nextPicks)
      await picksState.savePicks(nextPicks)

      setDraftByMatchId((current) => {
        const next = { ...current }
        delete next[match.id]
        return next
      })
      clearRowError(match.id)
      setSavedMatchId(match.id)

      showToast({
        tone: 'success',
        title: 'Pick saved',
        message: `${match.homeTeam.code} vs ${match.awayTeam.code} saved.`
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save pick.'
      setRowError(match.id, message)
      showToast({
        tone: 'danger',
        title: 'Save failed',
        message
      })
    } finally {
      setSavingMatchId(null)
    }
  }

  if (picksState.state.status === 'loading' || publishedSnapshot.state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load match picks">
        {picksState.state.message}
      </Alert>
    )
  }

  return (
    <PageShellV2 className="landing-v2-canvas p-4">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Predictions"
        title="Match Picks"
        subtitle="Use the shared timeline model to edit only the current 48-hour window."
        actions={(
          <div className="flex items-center gap-2">
            <ButtonLink to={homePath} size="sm" variant="secondary">
              Back to Play Center
            </ButtonLink>
            {showExportMenu ? (
              <ExportMenuV2
                scopeLabel="Match picks + KO extras (you only)"
                snapshotLabel={formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)}
                lockMessage="Post-lock exports only. CSV format."
                onDownloadCsv={handleDownloadMatchPicksCsv}
              />
            ) : null}
          </div>
        )}
        metadata={
          <>
            <SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{`Upcoming ${upcomingDisplayCount}`}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{`Editable ${upcomingDisplayCount}`}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>KO extras only for predicted draws.</span>
          </>
        }
      />

      {publishedSnapshot.state.status === 'error' ? (
        <Alert tone="warning" title="Snapshot unavailable">
          {publishedSnapshot.state.message}
        </Alert>
      ) : null}

      {scoringState.status === 'error' ? (
        <Alert tone="warning" title="Points unavailable">
          {scoringState.message}
        </Alert>
      ) : null}

      {!timelineModel.hasFixtures ? (
        <SectionCardV2 tone="panel" className="p-4 md:p-5">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">No matches available</div>
            <div className="text-sm text-muted-foreground">
              No upcoming or historical kickoff timestamps were found in this dataset.
            </div>
            <SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />
          </div>
        </SectionCardV2>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
          <div className="space-y-3">
            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">UPCOMING</h2>
                <StatusTagV2 tone="info">{String(upcomingDisplayCount)}</StatusTagV2>
              </div>

              {upcomingDisplayMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  No editable upcoming matches right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingDisplayMatches.map((item) => {
                    const match = item.match
                    const pick = pickByMatchId.get(match.id)
                    const baselineDraft = toDraft(pick)
                    const draft = draftByMatchId[match.id] ?? baselineDraft
                    const rowDirty = isDraftDirty(draft, baselineDraft)

                    return (
                      <MatchRow
                        key={match.id}
                        item={item}
                        draft={draft}
                        rowDirty={rowDirty}
                        rowError={rowErrorByMatchId[match.id]}
                        isSaving={savingMatchId === match.id}
                        isSaved={savedMatchId === match.id && !rowDirty}
                        onHomeScoreChange={(value) => {
                          if (!/^\d*$/.test(value)) return
                          updateDraft(match.id, (current) => ({ ...current, homeScore: value }))
                        }}
                        onAwayScoreChange={(value) => {
                          if (!/^\d*$/.test(value)) return
                          updateDraft(match.id, (current) => ({ ...current, awayScore: value }))
                        }}
                        onWinnerChange={(value) => {
                          updateDraft(match.id, (current) => ({ ...current, eventualWinnerTeamId: value }))
                        }}
                        onKoMethodChange={(value) => {
                          updateDraft(match.id, (current) => ({ ...current, koWinMethod: value }))
                        }}
                        onSave={() => void handleSaveMatch(item)}
                      />
                    )
                  })}
                </div>
              )}
            </SectionCardV2>

            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">RECENT RESULTS</h2>
                <StatusTagV2 tone="secondary">{String(recentResultsDisplay.length)}</StatusTagV2>
              </div>
              <ResultsTable
                items={recentResultsDisplay}
                picksByMatchId={pickByMatchId}
                scoring={scoring}
                emptyMessage="No recent results in the last 48 hours."
              />
            </SectionCardV2>

            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">OLDER RESULTS</h2>
                <div className="flex items-center gap-2">
                  <StatusTagV2 tone="secondary">{String(olderResultsDisplay.length)}</StatusTagV2>
                  <Button size="sm" variant="secondary" onClick={() => setArchiveExpanded((current) => !current)}>
                    {archiveExpanded ? 'Hide archive' : 'Show archive'}
                  </Button>
                </div>
              </div>
              {archiveExpanded ? (
                <ResultsTable
                  items={olderResultsDisplay}
                  picksByMatchId={pickByMatchId}
                  scoring={scoring}
                  emptyMessage="No older results to show."
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  Archive collapsed by default.
                </div>
              )}
            </SectionCardV2>
          </div>

          {isDesktopViewport ? (
            <RightRailSticky>
              <LeaderboardCardCurated
                rows={leaderboardRowsForCard}
                snapshotLabel={formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)}
                topCount={3}
                title={leaderboardCardTitle}
                leaderboardPath={leaderboardPath}
                priorityUserIds={rivalUserIds}
              />
            </RightRailSticky>
          ) : null}
        </div>
      )}

      {!isDesktopViewport ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            className="league-peek-fab fixed bottom-[calc(var(--bottom-nav-height)+0.75rem)] right-4 z-40 h-10 rounded-full px-4 text-[12px] lg:hidden"
            onClick={() => setLeaguePeekOpen(true)}
          >
            League Peek
          </Button>
          <Sheet open={leaguePeekOpen} onOpenChange={setLeaguePeekOpen}>
            <SheetContent side="bottom" className="league-peek-sheet-content max-h-[80dvh] rounded-t-2xl p-0">
              <SheetHeader>
                <SheetTitle>League Peek</SheetTitle>
                <SheetDescription>Snapshot leaderboard summary.</SheetDescription>
              </SheetHeader>
              <div className="p-3">
                <LeaderboardCardCurated
                  rows={leaderboardRowsForCard}
                  snapshotLabel={formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)}
                  topCount={3}
                  title={leaderboardCardTitle}
                  leaderboardPath={leaderboardPath}
                  priorityUserIds={rivalUserIds}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </PageShellV2>
  )
}
