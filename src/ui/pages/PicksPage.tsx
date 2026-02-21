import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { areMatchesCompleted, isMatchCompleted } from '../../lib/matchStatus'
import { getPickOutcome, getPredictedWinner, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickAdvances } from '../../types/picks'
import type { KnockoutStage, ScoringConfig, StageScoring } from '../../types/scoring'
import {
  LeaderboardCardCurated,
  RightRailSticky,
  type LeaderboardCardRow
} from '../components/group-stage/GroupStageDashboardComponents'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
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
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { rankRowsWithTiePriority } from '../lib/leaderboardTieRanking'
import {
  computeMatchTimelineModel,
  type MatchReadOnlyReason,
  type MatchTimelineItem
} from '../lib/matchTimeline'
import { readUserProfile } from '../lib/profilePersistence'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'

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

function resolveRowStatus(item: MatchTimelineItem): { tone: 'info' | 'warning' | 'success' | 'secondary' | 'locked'; label: string } {
  if (!item.editable) return { tone: 'locked', label: 'Read-only' }
  if (item.normalizedStatus === 'live') return { tone: 'warning', label: 'Live' }
  if (item.normalizedStatus === 'completed') return { tone: 'success', label: 'Completed' }
  if (item.normalizedStatus === 'scheduled') return { tone: 'info', label: 'Scheduled' }
  return { tone: 'secondary', label: 'Archived' }
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
  const statusMeta = resolveRowStatus(item)
  const stageLabel = match.group ? `Group ${match.group}` : match.stage

  return (
    <div className="rounded-lg border border-border/65 bg-background/35 px-2.5 py-2">
      <div className="grid items-center gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,160px)_minmax(0,220px)] md:gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-foreground">
            {match.homeTeam.code} vs {match.awayTeam.code}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {stageLabel} · {formatKickoff(match.kickoffUtc)}
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
            className="h-8 w-16 px-2 py-1 text-center text-[13px] tabular-nums"
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
            className="h-8 w-16 px-2 py-1 text-center text-[13px] tabular-nums"
            aria-label={`${match.awayTeam.code} score`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          <Badge tone={statusMeta.tone} className="h-6 px-2 text-[11px] normal-case tracking-normal">
            {statusMeta.label}
          </Badge>
          {item.editable && !requiresKoExtras ? (
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
          <span className={`text-[11px] ${rowDirty ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            {item.editable
              ? isSaving
                ? 'Saving...'
                : rowDirty
                  ? 'Edited'
                  : isSaved
                    ? 'Saved'
                    : 'No changes'
              : 'Locked'}
          </span>
        </div>
      </div>

      {item.editable && requiresKoExtras ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2 text-[11px] ${draft.eventualWinnerTeamId === 'HOME' ? 'border-primary' : ''}`}
            onClick={() => onWinnerChange('HOME')}
          >
            {match.homeTeam.code}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2 text-[11px] ${draft.eventualWinnerTeamId === 'AWAY' ? 'border-primary' : ''}`}
            onClick={() => onWinnerChange('AWAY')}
          >
            {match.awayTeam.code}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2 text-[11px] ${draft.koWinMethod === 'ET' ? 'border-primary' : ''}`}
            onClick={() => onKoMethodChange('ET')}
          >
            AET
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className={`h-7 rounded-md px-2 text-[11px] ${draft.koWinMethod === 'PENS' ? 'border-primary' : ''}`}
            onClick={() => onKoMethodChange('PENS')}
          >
            Pens
          </Button>
          <Button
            size="sm"
            className="h-8 rounded-lg px-3 text-[12px]"
            onClick={onSave}
            disabled={!canSave}
            loading={isSaving}
          >
            Save
          </Button>
        </div>
      ) : null}

      {!item.editable ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{readOnlyReasonLabel(item.readOnlyReason)}</div>
      ) : null}

      {rowError ? <div className="mt-1 text-[11px] text-destructive">{rowError}</div> : null}
    </div>
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
          <div className="truncate text-[13px] font-semibold text-foreground">
            {match.homeTeam.code} vs {match.awayTeam.code}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {stageLabel} · {formatKickoff(match.kickoffUtc)}
          </div>
        </div>
      </td>
      <td className="text-[13px] tabular-nums">{resolvePredictedLabel(pick)}</td>
      <td className="text-[13px] tabular-nums">{resolveActualLabel(match)}</td>
      <td>
        <Badge tone={resultTone(outcome)} className="h-6 px-2 text-[11px] normal-case tracking-normal">
          {resultLabel(outcome)}
        </Badge>
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

    async function loadRivals() {
      try {
        const profile = await readUserProfile(mode, viewerId)
        if (canceled) return
        setRivalUserIds(sanitizeRivalUserIds(profile.rivalUserIds, viewerId))
      } catch {
        if (!canceled) setRivalUserIds([])
      }
    }

    void loadRivals()
    return () => {
      canceled = true
    }
  }, [mode, viewerId])

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

  const leaderboardRowsForCard = useMemo<LeaderboardCardRow[]>(() => {
    if (!snapshotReady) return []
    const sectionRows = buildLeaderboardPresentation({
      snapshotTimestamp: snapshotReady.snapshotTimestamp,
      groupStageComplete: snapshotReady.groupStageComplete,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      leaderboardRows: snapshotReady.leaderboardRows
    }).rows.map((entry) => {
      const sectionPoints = entry.exactPoints + entry.resultPoints + entry.knockoutPoints
      const memberKey = normalizeKey(entry.member.id)
      return {
        id: entry.member.id || entry.member.name,
        name: entry.member.name,
        points: sectionPoints,
        isYou: memberKey.length > 0 && memberKey === normalizeKey(viewerId)
      }
    })

    const ranked = rankRowsWithTiePriority({
      rows: sectionRows,
      getPoints: (row) => row.points,
      getIdentityKeys: (row) => [row.id],
      getName: (row) => row.name,
      viewerIdentity: viewerId,
      rivalIdentities: rivalUserIds
    })

    return ranked.rankedRows.map(({ row, rank }) => ({
      id: row.id,
      name: row.name,
      rank,
      points: row.points,
      isYou: row.isYou
    }))
  }, [rivalUserIds, snapshotReady, viewerId])

  const leaderboardPath = location.pathname.startsWith('/demo/') ? '/demo/leaderboard' : '/leaderboard'
  const leaderboardCardTitle = isMatchPicksFinal ? 'Final Leaderboard' : 'Projected Leaderboard'
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible
  const upcomingDisplayCount = upcomingDisplayMatches.length
  const scoring = scoringState.status === 'ready' ? scoringState.scoring : null

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
        actions={
          showExportMenu ? (
            <ExportMenuV2
              scopeLabel="Match picks + KO extras (you only)"
              snapshotLabel={formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)}
              lockMessage="Post-lock exports only. CSV format."
              onDownloadCsv={handleDownloadMatchPicksCsv}
            />
          ) : undefined
        }
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
                <Badge tone="info">{upcomingDisplayCount}</Badge>
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
                <Badge tone="secondary">{timelineModel.recentResults.length}</Badge>
              </div>
              <ResultsTable
                items={timelineModel.recentResults}
                picksByMatchId={pickByMatchId}
                scoring={scoring}
                emptyMessage="No recent results in the last 48 hours."
              />
            </SectionCardV2>

            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">OLDER RESULTS</h2>
                <div className="flex items-center gap-2">
                  <Badge tone="secondary">{timelineModel.olderResults.length}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => setArchiveExpanded((current) => !current)}>
                    {archiveExpanded ? 'Hide archive' : 'Show archive'}
                  </Button>
                </div>
              </div>
              {archiveExpanded ? (
                <ResultsTable
                  items={timelineModel.olderResults}
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
