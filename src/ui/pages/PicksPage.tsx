import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchScoring } from '../../lib/data'
import { areMatchesCompleted, isMatchCompleted } from '../../lib/matchStatus'
import { getPickOutcome, getPredictedWinner, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickAdvances } from '../../types/picks'
import type { KnockoutStage, ScoringConfig, StageScoring } from '../../types/scoring'
import MatchPick, { type MatchPickChange, type MatchPickDecidedIn } from '../components/MatchPick'
import { Alert } from '../components/ui/Alert'
import { Button, ButtonLink } from '../components/ui/Button'
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
import InlineStateHintV2 from '../components/v2/InlineStateHintV2'
import { RightRailSticky } from '../components/v2/LeaderboardSideListV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SideListPanelV2 from '../components/v2/SideListPanelV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import StatusTagV2 from '../components/v2/StatusTagV2'
import TeamIdentityInlineV2 from '../components/v2/TeamIdentityInlineV2'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import {
  computeMatchTimelineModel,
  type MatchReadOnlyReason,
  type MatchTimelineItem
} from '../lib/matchTimeline'
import {
  lockedFinalLabel,
  publishedStateLabel,
  SNAPSHOT_METADATA_PREFIX
} from '../lib/pageStatusCopy'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { resolveTeamFlagMeta } from '../lib/teamFlag'
import { downloadWorkbook } from '../lib/exportWorkbook'

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
  onDraftChange: (next: MatchDraft) => void
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
const RECENT_RESULTS_FALLBACK_COUNT = 5

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
  if (reason === 'global-lock') return lockedFinalLabel('FINAL')
  if (reason === 'in-progress') return 'Locked: Kickoff passed for this match.'
  if (reason === 'outside-window') return 'Locked until 72 hours before kickoff.'
  if (reason === 'missing-kickoff') return 'Kickoff unavailable.'
  return 'Locked.'
}

function formatWindowDeadline(utcIso: string | null): string {
  if (!utcIso) return 'Unavailable'
  const timestamp = new Date(utcIso).getTime()
  if (!Number.isFinite(timestamp)) return 'Unavailable'
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  })
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

function toMatchPickDecidedIn(value: '' | KoWinMethod): MatchPickDecidedIn {
  if (value === 'ET') return 'AET'
  if (value === 'PENS') return 'PEN'
  return 'REG'
}

function fromMatchPickDecidedIn(value: MatchPickDecidedIn): '' | KoWinMethod {
  if (value === 'AET') return 'ET'
  if (value === 'PEN') return 'PENS'
  return ''
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
  onDraftChange,
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
  const homeFlagPath = resolveTeamFlagMeta({ code: match.homeTeam.code, name: match.homeTeam.name }).assetPath
  const awayFlagPath = resolveTeamFlagMeta({ code: match.awayTeam.code, name: match.awayTeam.name }).assetPath
  const scoreA = parsedHome
  const scoreB = parsedAway
  const readOnlyLabel = readOnlyReasonLabel(item.readOnlyReason)
  const interactionTag = !item.editable
    ? { tone: 'locked' as const, label: 'Locked' }
    : isSaving
      ? { tone: 'warning' as const, label: 'Saving pick...' }
      : isSaved
        ? { tone: 'success' as const, label: 'Pick saved' }
        : null
  const interactionHintLabel = rowDirty ? 'Unsaved pick' : null

  function handleMatchPickChange(next: MatchPickChange) {
    if (!item.editable || isSaving) return
    const nextHomeScore = typeof next.scoreA === 'number' ? String(next.scoreA) : ''
    const nextAwayScore = typeof next.scoreB === 'number' ? String(next.scoreB) : ''
    const nextHasScores = typeof next.scoreA === 'number' && typeof next.scoreB === 'number'
    const nextRequiresKoExtras = isKnockout && nextHasScores && next.scoreA === next.scoreB
    const nextWinnerFromEvent =
      next.selectedWinnerId === 'HOME' || next.selectedWinnerId === 'AWAY' ? next.selectedWinnerId : ''
    const nextMethodFromEvent = fromMatchPickDecidedIn(next.decidedIn)
    const mergedWinner = nextRequiresKoExtras
      ? (nextWinnerFromEvent || draft.eventualWinnerTeamId)
      : ''
    const mergedMethod = nextRequiresKoExtras
      ? (nextMethodFromEvent || draft.koWinMethod)
      : ''

    onDraftChange({
      homeScore: nextHomeScore,
      awayScore: nextAwayScore,
      eventualWinnerTeamId:
        mergedWinner === 'HOME' || mergedWinner === 'AWAY' ? mergedWinner : '',
      koWinMethod: mergedMethod === 'ET' || mergedMethod === 'PENS' ? mergedMethod : ''
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="v2-type-caption truncate">
            {stageLabel} · {kickoffLabel}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {interactionTag ? (
            <StatusTagV2 tone={interactionTag.tone}>{interactionTag.label}</StatusTagV2>
          ) : interactionHintLabel ? (
            <InlineStateHintV2>{interactionHintLabel}</InlineStateHintV2>
          ) : null}
          {item.editable && rowDirty ? (
            <Button
              size="sm"
              className="v2-action-compact"
              onClick={onSave}
              disabled={!canSave}
              loading={isSaving}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>

      <MatchPick
        matchId={match.id}
        isKnockout={isKnockout}
        teamA={{
          id: 'HOME',
          name: match.homeTeam.name,
          abbr: match.homeTeam.code,
          flagUrl: homeFlagPath
        }}
        teamB={{
          id: 'AWAY',
          name: match.awayTeam.name,
          abbr: match.awayTeam.code,
          flagUrl: awayFlagPath
        }}
        scoreA={scoreA}
        scoreB={scoreB}
        decidedIn={toMatchPickDecidedIn(draft.koWinMethod)}
        selectedWinnerId={
          draft.eventualWinnerTeamId === 'HOME' || draft.eventualWinnerTeamId === 'AWAY'
            ? draft.eventualWinnerTeamId
            : undefined
        }
        disabled={!item.editable || isSaving}
        knockoutDrawEnabled={requiresKoExtras}
        rowState={rowState}
        onChange={handleMatchPickChange}
      />

      {!item.editable && readOnlyLabel ? (
        <div className="v2-type-caption truncate">
          {readOnlyLabel}
        </div>
      ) : null}

      {rowError ? <div className="v2-type-caption text-destructive">{rowError}</div> : null}
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
          <div className="v2-type-body-sm flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
            <TeamIdentityInlineV2 code={match.homeTeam.code} name={match.homeTeam.name} />
            <span className="shrink-0 text-muted-foreground">vs</span>
            <TeamIdentityInlineV2 code={match.awayTeam.code} name={match.awayTeam.name} />
          </div>
          <div className="v2-type-caption truncate">
            {stageLabel} · {formatKickoff(match.kickoffUtc)}
          </div>
        </div>
      </td>
      <td className="v2-type-meta tabular-nums">{resolvePredictedLabel(pick)}</td>
      <td className="v2-type-meta tabular-nums">{resolveActualLabel(match)}</td>
      <td>
        <StatusTagV2 tone={resultTone(outcome)}>
          {resultLabel(outcome)}
        </StatusTagV2>
      </td>
      <td className="v2-type-meta text-right font-semibold tabular-nums text-foreground">
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
      className="[&_th]:h-8 [&_th]:border-b-[color:var(--divider)] [&_th]:px-2 [&_th]:py-0 [&_th]:uppercase [&_th]:tracking-[0.1em] [&_th]:text-muted-foreground [&_td]:h-10 [&_td]:border-b-[color:var(--divider)] [&_td]:px-2 [&_td]:py-1.5"
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

function resolveKnockoutWinnerLegend(scoring: ScoringConfig | null): string {
  if (!scoring) return 'Knockout draw winner bonus unavailable.'
  const winnerBonuses = Object.values(scoring.knockout)
    .map((stage) => stage.knockoutWinner)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  if (winnerBonuses.length === 0) return 'Knockout draw winner bonus unavailable.'

  const uniqueBonuses = [...new Set(winnerBonuses)].sort((left, right) => left - right)
  if (uniqueBonuses.length === 1) return `Knockout draw winner: +${uniqueBonuses[0]} pts`
  return `Knockout draw winner: +${uniqueBonuses[0]} to +${uniqueBonuses[uniqueBonuses.length - 1]} pts by round`
}

type PicksSupportRailProps = {
  setCount: number
  totalCount: number
  remainingCount: number
  nextLockMatch: MatchTimelineItem | null
  nextLockLabel: string
  scoring: ScoringConfig | null
  missingScoresCount: number
  drawExtrasMissingCount: number
  unsavedCount: number
}

function PicksSupportRail({
  setCount,
  totalCount,
  remainingCount,
  nextLockMatch,
  nextLockLabel,
  scoring,
  missingScoresCount,
  drawExtrasMissingCount,
  unsavedCount
}: PicksSupportRailProps) {
  const completionTone =
    totalCount === 0 ? 'secondary' : remainingCount === 0 ? 'success' : 'warning'
  const needsAttentionCount = missingScoresCount + drawExtrasMissingCount + unsavedCount
  const needsAttentionTone = needsAttentionCount > 0 ? 'warning' : 'success'
  const stageLabel = nextLockMatch?.match.group
    ? `Group ${nextLockMatch.match.group}`
    : nextLockMatch?.match.stage

  return (
    <SideListPanelV2
      title="Pick window"
      subtitle="Set your remaining picks before the next lock."
      contentClassName="v2-list-divider space-y-0 p-3"
    >
      <section className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="v2-type-kicker v2-track-10">Remaining picks</div>
          <div className="mt-1.5 text-4xl font-semibold leading-none tabular-nums text-foreground">
            {remainingCount}
            <span className="v2-type-body-md ml-1 font-medium text-muted-foreground">/ {totalCount}</span>
          </div>
          <div className="v2-type-caption mt-1">{setCount} / {totalCount} set</div>
        </div>
        <StatusTagV2 tone={completionTone} className="ml-auto mt-1 shrink-0">
          {remainingCount === 0 && totalCount > 0 ? 'All set' : 'Open'}
        </StatusTagV2>
      </section>

      <section>
        <div className="v2-type-kicker v2-track-10">Next lock</div>
        {nextLockMatch ? (
          <>
            <div className="v2-type-body-sm mt-1.5 font-medium text-foreground">{formatKickoff(nextLockMatch.match.kickoffUtc)}</div>
            <div className="v2-type-body-sm mt-1.5 flex min-w-0 items-center gap-1.5 text-foreground">
              <TeamIdentityInlineV2 code={nextLockMatch.match.homeTeam.code} name={nextLockMatch.match.homeTeam.name} size="xs" />
              <span className="text-muted-foreground">vs</span>
              <TeamIdentityInlineV2 code={nextLockMatch.match.awayTeam.code} name={nextLockMatch.match.awayTeam.name} size="xs" />
            </div>
            <div className="v2-type-caption mt-1">{stageLabel}</div>
          </>
        ) : (
          <div className="mt-1.5 v2-type-caption">{nextLockLabel}</div>
        )}
      </section>

      <section>
        <div className="mb-1 flex items-center gap-2">
          <span className="v2-type-kicker v2-track-10">Needs attention</span>
          <StatusTagV2 tone={needsAttentionTone} className="ml-auto">
            {needsAttentionCount === 0 ? 'All clear' : `${needsAttentionCount} open`}
          </StatusTagV2>
        </div>
        <div className="space-y-1.5 v2-type-caption">
          <div className="flex items-center justify-between gap-2">
            <span>Missing scores</span>
            <span className="font-medium tabular-nums text-foreground">{missingScoresCount}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Draw picks missing winner + AET/PEN</span>
            <span className="font-medium tabular-nums text-foreground">{drawExtrasMissingCount}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Unsaved edits</span>
            <span className="font-medium tabular-nums text-foreground">{unsavedCount}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="v2-type-kicker v2-track-10">Scoring legend</div>
        <div className="mt-1.5 v2-type-caption">
          Exact both <span className="font-medium text-foreground">+{scoring?.group.exactScoreBoth ?? '—'}</span> · one{' '}
          <span className="font-medium text-foreground">+{scoring?.group.exactScoreOne ?? '—'}</span> · result{' '}
          <span className="font-medium text-foreground">+{scoring?.group.result ?? '—'}</span>
        </div>
        <div className="mt-1 v2-type-caption">{resolveKnockoutWinnerLegend(scoring)}</div>
      </section>

      <p className="v2-type-caption leading-[1.4] text-muted-foreground">
        If you call a knockout draw, choose the eventual winner and AET/PEN. Non-draw picks ignore AET/PEN.
      </p>
    </SideListPanelV2>
  )
}

export default function PicksPage() {
  const mode = useRouteDataMode()
  const viewerId = useViewerId()
  const now = useNow({ tickMs: 300_000 })
  const isDesktopViewport = useMediaQuery('(min-width: 1024px)')
  const picksState = usePicksData()
  const publishedSnapshot = usePublishedSnapshot()
  const phaseState = useTournamentPhaseState()
  const { showToast } = useToast()

  const [pickGuideOpen, setPickGuideOpen] = useState(false)
  const [laterExpanded, setLaterExpanded] = useState(false)
  const [archiveExpanded, setArchiveExpanded] = useState(false)
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null)
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null)
  const [draftByMatchId, setDraftByMatchId] = useState<Record<string, MatchDraft>>({})
  const [rowErrorByMatchId, setRowErrorByMatchId] = useState<Record<string, string>>({})
  const [scoringState, setScoringState] = useState<ScoringState>({ status: 'loading' })

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

  const upcomingMatches = useMemo(
    () => timelineModel.upcoming.filter((item) => item.readOnlyReason !== 'outside-window'),
    [timelineModel.upcoming]
  )
  const laterMatches = useMemo(
    () => timelineModel.upcoming.filter((item) => item.readOnlyReason === 'outside-window'),
    [timelineModel.upcoming]
  )
  const upcomingVisibleCount = upcomingMatches.length
  const upcomingEditableCount = useMemo(
    () => upcomingMatches.filter((item) => item.editable).length,
    [upcomingMatches]
  )

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const isMatchPicksFinal = useMemo(() => areMatchesCompleted(matches), [matches])
  const editableWindowLabel = useMemo(
    () => formatWindowDeadline(timelineModel.window.endUtc),
    [timelineModel.window.endUtc]
  )
  const picksStateCopy = useMemo(() => {
    if (isMatchPicksFinal || !phaseState.lockFlags.matchPicksEditable) {
      return lockedFinalLabel('FINAL')
    }
    if (upcomingEditableCount > 0) {
      return `Editable until: ${editableWindowLabel}.`
    }
    return 'Locked: No picks are editable right now.'
  }, [editableWindowLabel, isMatchPicksFinal, phaseState.lockFlags.matchPicksEditable, upcomingEditableCount])
  const picksPublishedCopy = isMatchPicksFinal ? publishedStateLabel('FINAL') : publishedStateLabel(phaseState.tournamentPhase)

  const homePath = mode === 'demo' ? '/demo' : '/'
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible
  const scoring = scoringState.status === 'ready' ? scoringState.scoring : null
  const recentWindowResults = useMemo(
    () => [...timelineModel.recentResults].sort(sortByKickoffLatestFirst),
    [timelineModel.recentResults]
  )
  const archiveBaseResults = useMemo(
    () => [...timelineModel.olderResults].sort(sortByKickoffLatestFirst),
    [timelineModel.olderResults]
  )
  const recentResultsDisplay = useMemo(() => {
    if (recentWindowResults.length > 0) return recentWindowResults
    return archiveBaseResults.slice(0, RECENT_RESULTS_FALLBACK_COUNT)
  }, [archiveBaseResults, recentWindowResults])
  const archiveResultsDisplay = useMemo(() => {
    if (recentWindowResults.length > 0) return archiveBaseResults
    const fallbackMatchIds = new Set(
      archiveBaseResults.slice(0, RECENT_RESULTS_FALLBACK_COUNT).map((item) => item.match.id)
    )
    return archiveBaseResults.filter((item) => !fallbackMatchIds.has(item.match.id))
  }, [archiveBaseResults, recentWindowResults])

  useEffect(() => {
    if (!isDesktopViewport) return
    setPickGuideOpen(false)
  }, [isDesktopViewport])

  const pickByMatchId = useMemo(() => {
    return new Map(
      picksState.picks
        .filter((pick) => pick.userId.trim().toLowerCase() === viewerId.trim().toLowerCase())
        .map((pick) => [pick.matchId, pick] as const)
    )
  }, [picksState.picks, viewerId])

  const pickWindowMatches = useMemo(
    () => upcomingMatches.filter((item) => item.normalizedStatus === 'scheduled'),
    [upcomingMatches]
  )

  const pickWindowRailData = useMemo(() => {
    let setCount = 0
    let missingScoresCount = 0
    let drawExtrasMissingCount = 0
    let unsavedCount = 0

    for (const item of pickWindowMatches) {
      const match = item.match
      const baseline = toDraft(pickByMatchId.get(match.id))
      const draft = draftByMatchId[match.id] ?? baseline
      const rowDirty = isDraftDirty(draft, baseline)
      const parsedHome = parseScore(draft.homeScore)
      const parsedAway = parseScore(draft.awayScore)
      const hasScores = parsedHome !== undefined && parsedAway !== undefined
      const isKnockout = match.stage !== 'Group'
      const predictedDraw = hasScores && parsedHome === parsedAway

      if (rowDirty) unsavedCount += 1
      if (!hasScores) missingScoresCount += 1

      const hasKnockoutExtras = draft.eventualWinnerTeamId === 'HOME' || draft.eventualWinnerTeamId === 'AWAY'
      const hasKoMethod = draft.koWinMethod === 'ET' || draft.koWinMethod === 'PENS'
      const drawExtrasMissing = isKnockout && predictedDraw && (!hasKnockoutExtras || !hasKoMethod)
      if (drawExtrasMissing) drawExtrasMissingCount += 1
      const isSet = hasScores && !drawExtrasMissing

      if (isSet) setCount += 1
    }

    const totalCount = pickWindowMatches.length
    return {
      setCount,
      totalCount,
      remainingCount: Math.max(totalCount - setCount, 0),
      missingScoresCount,
      drawExtrasMissingCount,
      unsavedCount
    }
  }, [draftByMatchId, pickByMatchId, pickWindowMatches])

  const nextLockMatch = useMemo(() => pickWindowMatches[0] ?? null, [pickWindowMatches])

  const nextLockLabel = useMemo(() => {
    if (isMatchPicksFinal) return 'Final snapshot. No remaining locks.'
    if (nextLockMatch) return formatWindowDeadline(nextLockMatch.match.kickoffUtc)
    if (timelineModel.window.endUtc) return formatWindowDeadline(timelineModel.window.endUtc)
    return 'No upcoming lock in this window.'
  }, [isMatchPicksFinal, nextLockMatch, timelineModel.window.endUtc])

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

  const handleDownloadMatchPicksXlsx = useCallback(() => {
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
    const fileName = `match-picks-${safeViewerId || 'viewer'}-${stamp}.xlsx`
    void downloadWorkbook(fileName, [
      {
        name: 'MatchPicks',
        rows,
        headerRowIndices: [5]
      }
    ]).catch(() => {
      showToast({ tone: 'danger', title: 'Export failed', message: 'Unable to prepare match picks export.' })
    })
  }, [matches, mode, pickByMatchId, showToast, snapshotReady?.snapshotTimestamp, viewerId])

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
    <PageShellV2 className="landing-v2-canvas">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Predictions"
        title="Match Picks"
        subtitle="Set your picks in the current 72-hour window before each match locks."
        actions={(
          <>
            <ButtonLink to={homePath} size="sm" variant="secondary">
              Back to Play Center
            </ButtonLink>
            {showExportMenu ? (
              <ExportMenuV2
                description={`Download your match picks workbook from ${formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)}.`}
                onAction={handleDownloadMatchPicksXlsx}
              />
            ) : null}
          </>
        )}
        metadataItems={[
          <SnapshotStamp key="snapshot" timestamp={snapshotReady?.snapshotTimestamp} prefix={SNAPSHOT_METADATA_PREFIX} />,
          <span key="state">{picksStateCopy}</span>,
          <span key="published">{picksPublishedCopy}</span>
        ]}
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
          </div>
        </SectionCardV2>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
          <div className="space-y-3">
            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">UP NEXT</h2>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusTagV2 tone="info">{String(upcomingVisibleCount)}</StatusTagV2>
                </div>
              </div>

              {upcomingMatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  No upcoming matches are editable right now.
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingMatches.map((item) => {
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
                        isSaved={savedMatchId === match.id}
                        onDraftChange={(nextDraft) => {
                          updateDraft(match.id, () => nextDraft)
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
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusTagV2 tone="secondary">{String(recentResultsDisplay.length)}</StatusTagV2>
                </div>
              </div>
              <ResultsTable
                items={recentResultsDisplay}
                picksByMatchId={pickByMatchId}
                scoring={scoring}
                emptyMessage="No recent results in the last 72 hours."
              />
            </SectionCardV2>

            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">FIXTURES</h2>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusTagV2 tone="secondary">{String(laterMatches.length)}</StatusTagV2>
                  <Button size="sm" variant="secondary" onClick={() => setLaterExpanded((current) => !current)}>
                    {laterExpanded ? 'Hide fixtures' : 'Show fixtures'}
                  </Button>
                </div>
              </div>
              {laterExpanded ? (
                laterMatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                    No fixtures to show.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {laterMatches.map((item) => {
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
                          isSaved={savedMatchId === match.id}
                          onDraftChange={(nextDraft) => {
                            updateDraft(match.id, () => nextDraft)
                          }}
                          onSave={() => void handleSaveMatch(item)}
                        />
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  Show fixtures to browse upcoming matches.
                </div>
              )}
            </SectionCardV2>

            <SectionCardV2 tone="panel" density="none" className="rounded-xl p-3 md:p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="v2-heading-h2 text-foreground">ARCHIVE</h2>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusTagV2 tone="secondary">{String(archiveResultsDisplay.length)}</StatusTagV2>
                  <Button size="sm" variant="secondary" onClick={() => setArchiveExpanded((current) => !current)}>
                    {archiveExpanded ? 'Hide archive' : 'Show archive'}
                  </Button>
                </div>
              </div>
              {archiveExpanded ? (
                <ResultsTable
                  items={archiveResultsDisplay}
                  picksByMatchId={pickByMatchId}
                  scoring={scoring}
                  emptyMessage="No archive results to show."
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  Show archive to review older results.
                </div>
              )}
            </SectionCardV2>
          </div>

          {isDesktopViewport ? (
            <RightRailSticky>
              <PicksSupportRail
                setCount={pickWindowRailData.setCount}
                totalCount={pickWindowRailData.totalCount}
                remainingCount={pickWindowRailData.remainingCount}
                nextLockMatch={nextLockMatch}
                nextLockLabel={nextLockLabel}
                scoring={scoring}
                missingScoresCount={pickWindowRailData.missingScoresCount}
                drawExtrasMissingCount={pickWindowRailData.drawExtrasMissingCount}
                unsavedCount={pickWindowRailData.unsavedCount}
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
            className="league-peek-fab fixed bottom-[calc(var(--bottom-nav-height)+0.75rem)] right-4 z-40 h-10 rounded-full px-4 lg:hidden"
            onClick={() => setPickGuideOpen(true)}
          >
            Pick guide
          </Button>
          <Sheet open={pickGuideOpen} onOpenChange={setPickGuideOpen}>
            <SheetContent side="bottom" className="league-peek-sheet-content max-h-[80dvh] rounded-t-2xl p-0">
              <SheetHeader>
                <SheetTitle>Pick guide</SheetTitle>
                <SheetDescription>Remaining picks, next lock, and what still needs attention.</SheetDescription>
              </SheetHeader>
              <div className="p-3">
                <PicksSupportRail
                  setCount={pickWindowRailData.setCount}
                  totalCount={pickWindowRailData.totalCount}
                  remainingCount={pickWindowRailData.remainingCount}
                  nextLockMatch={nextLockMatch}
                  nextLockLabel={nextLockLabel}
                  scoring={scoring}
                  missingScoresCount={pickWindowRailData.missingScoresCount}
                  drawExtrasMissingCount={pickWindowRailData.drawExtrasMissingCount}
                  unsavedCount={pickWindowRailData.unsavedCount}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </PageShellV2>
  )
}
