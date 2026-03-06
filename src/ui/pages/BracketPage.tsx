import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'

import { isMatchCompleted } from '../../lib/matchStatus'
import type { Match, MatchWinner } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import ExportMenuV2 from '../components/v2/ExportMenuV2'
import PageHeaderV2 from '../components/v2/PageHeaderV2'
import PageShellV2 from '../components/v2/PageShellV2'
import RowShellV2 from '../components/v2/RowShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import SnapshotStamp from '../components/v2/SnapshotStamp'
import StatusTagV2 from '../components/v2/StatusTagV2'
import TeamIdentityInlineV2 from '../components/v2/TeamIdentityInlineV2'
import { useTournamentPhaseState } from '../context/TournamentPhaseContext'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { cn } from '../lib/utils'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'
import { downloadWorkbook } from '../lib/exportWorkbook'

const STAGE_LABELS: Record<KnockoutStage, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  Third: 'Third Place',
  Final: 'Final'
}

const STAGE_SHORT_LABELS: Record<KnockoutStage, string> = {
  R32: 'R32',
  R16: 'R16',
  QF: 'QF',
  SF: 'SF',
  Third: '3rd',
  Final: 'Final'
}

type PredictionResult = 'correct' | 'wrong' | 'pending'
type SourceOutcome = 'winner' | 'loser'

type TeamDisplay = {
  code: string
  name: string
}

type ResolvedMatch = {
  stage: KnockoutStage
  index: number
  match: Match
  homeTeam: TeamDisplay
  awayTeam: TeamDisplay
  pickedWinner: MatchWinner | undefined
  result: PredictionResult
}

type RoundModel = {
  stage: KnockoutStage
  matches: ResolvedMatch[]
  picked: number
  total: number
  complete: boolean
  unlocked: boolean
  editable: boolean
}

type BracketNode = {
  id: string
  match: ResolvedMatch
  x: number
  y: number
  side: 'left' | 'right' | 'center'
  interactive: boolean
}

type BracketConnector = {
  id: string
  path: string
  sourceStage: KnockoutStage
  targetStage: KnockoutStage
  dashed?: boolean
}

const BRACKET_NODE_METRICS = {
  paddingX: 8,
  paddingY: 6,
  headerHeight: 14,
  sectionGap: 4,
  teamRowHeight: 34,
  teamRowGap: 4,
  footerHeight: 12
} as const

const BRACKET_NODE_CARD_HEIGHT =
  BRACKET_NODE_METRICS.paddingY * 2 +
  BRACKET_NODE_METRICS.headerHeight +
  BRACKET_NODE_METRICS.sectionGap +
  BRACKET_NODE_METRICS.teamRowHeight * 2 +
  BRACKET_NODE_METRICS.teamRowGap +
  BRACKET_NODE_METRICS.sectionGap +
  BRACKET_NODE_METRICS.footerHeight

const BRACKET_WINNER_HIGHLIGHT_STYLE: CSSProperties = {
  boxShadow: 'var(--tone-info-glow)'
}

function bracketWinnerChoiceClass({
  selected,
  interactive,
  disabled = false,
  compact = false
}: {
  selected: boolean
  interactive: boolean
  disabled?: boolean
  compact?: boolean
}): string {
  return cn(
    'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all',
    compact ? 'text-[12px]' : 'text-[11px]',
    selected ? 'bg-[color:var(--tone-info-bg-soft)] text-foreground' : 'bg-[var(--surface-2)] text-muted-foreground',
    interactive
      ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      : undefined,
    disabled
      ? 'cursor-not-allowed opacity-60'
      : interactive
        ? 'cursor-pointer hover:-translate-y-px hover:bg-[var(--surface-1)] hover:text-foreground'
        : 'cursor-default'
  )
}

function bracketWinnerChoiceStyle(selected: boolean, style?: CSSProperties): CSSProperties | undefined {
  if (selected) return { ...style, ...BRACKET_WINNER_HIGHLIGHT_STYLE }
  return style
}

function isTbdLabel(value: string | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized.length === 0 || normalized === 'tbd' || normalized === 'to be decided'
}

function normalizeTeam(code: string | undefined, name: string | undefined): TeamDisplay {
  const resolvedCode = String(code ?? '').trim() || 'TBD'
  const resolvedName = String(name ?? '').trim() || resolvedCode
  return {
    code: resolvedCode,
    name: resolvedName
  }
}

function resolveTeamDisplayLabel(team: TeamDisplay): string {
  const code = String(team.code ?? '').trim()
  if (code && code.toUpperCase() !== 'TBD') return code

  const fallbackName = String(team.name ?? '').trim()
  if (!isTbdLabel(fallbackName)) return fallbackName

  if (code) return code
  return 'TBD'
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

function resultSurfaceClass(status: PredictionResult): string {
  if (status === 'correct') return 'bg-[color:var(--tone-success-bg-soft)]'
  if (status === 'wrong') return 'bg-[color:var(--tone-danger-bg-soft)]'
  return ''
}

function resolvePredictionResult(match: Match, pickedWinner: MatchWinner | undefined): PredictionResult {
  if (!isMatchCompleted(match) || !match.winner) return 'pending'
  return pickedWinner && pickedWinner === match.winner ? 'correct' : 'wrong'
}

function resolveTeamBySide(match: ResolvedMatch, side: MatchWinner): TeamDisplay {
  return side === 'HOME' ? match.homeTeam : match.awayTeam
}

function resolvePickedWinnerCode(match: ResolvedMatch): string {
  if (!match.pickedWinner) return '—'
  return resolveTeamDisplayLabel(resolveTeamBySide(match, match.pickedWinner))
}

function resolveSourceTeam(
  resolvedByStage: Partial<Record<KnockoutStage, ResolvedMatch[]>>,
  sourceStage: KnockoutStage,
  sourceIndex: number,
  outcome: SourceOutcome
): TeamDisplay | null {
  const sourceMatch = resolvedByStage[sourceStage]?.[sourceIndex]
  if (!sourceMatch?.pickedWinner) return null

  const side: MatchWinner =
    outcome === 'winner'
      ? sourceMatch.pickedWinner
      : sourceMatch.pickedWinner === 'HOME'
        ? 'AWAY'
        : 'HOME'

  return resolveTeamBySide(sourceMatch, side)
}

function deriveTeamsForMatch(
  stage: KnockoutStage,
  index: number,
  resolvedByStage: Partial<Record<KnockoutStage, ResolvedMatch[]>>
): { home: TeamDisplay | null; away: TeamDisplay | null } {
  if (stage === 'R16') {
    return {
      home: resolveSourceTeam(resolvedByStage, 'R32', index * 2, 'winner'),
      away: resolveSourceTeam(resolvedByStage, 'R32', index * 2 + 1, 'winner')
    }
  }

  if (stage === 'QF') {
    return {
      home: resolveSourceTeam(resolvedByStage, 'R16', index * 2, 'winner'),
      away: resolveSourceTeam(resolvedByStage, 'R16', index * 2 + 1, 'winner')
    }
  }

  if (stage === 'SF') {
    return {
      home: resolveSourceTeam(resolvedByStage, 'QF', index * 2, 'winner'),
      away: resolveSourceTeam(resolvedByStage, 'QF', index * 2 + 1, 'winner')
    }
  }

  if (stage === 'Final') {
    return {
      home: resolveSourceTeam(resolvedByStage, 'SF', 0, 'winner'),
      away: resolveSourceTeam(resolvedByStage, 'SF', 1, 'winner')
    }
  }

  if (stage === 'Third') {
    return {
      home: resolveSourceTeam(resolvedByStage, 'SF', 0, 'loser'),
      away: resolveSourceTeam(resolvedByStage, 'SF', 1, 'loser')
    }
  }

  return {
    home: null,
    away: null
  }
}

function roundHelperCopy(round: RoundModel, nextRound: RoundModel | null, bracketEditable: boolean): string {
  if (!round.unlocked) return 'Complete the previous round to unlock this stage.'
  if (!bracketEditable) return 'Bracket is locked for all rounds after the first knockout kickoff.'

  const remaining = Math.max(0, round.total - round.picked)
  if (remaining > 0) {
    return `${remaining} ${remaining === 1 ? 'pick remains' : 'picks remain'} before the next round unlocks.`
  }

  if (nextRound) return `Round complete. Continue to ${STAGE_LABELS[nextRound.stage]}.`
  return 'All rounds are complete. Review your full bracket.'
}

function primaryCtaLabel(round: RoundModel, nextRound: RoundModel | null): string {
  if (!round.complete && nextRound) return `Continue to ${STAGE_SHORT_LABELS[nextRound.stage]}`
  if (nextRound) return `Continue to ${STAGE_SHORT_LABELS[nextRound.stage]}`
  return 'Review Bracket'
}

function splitMatches(matches: ResolvedMatch[]): { left: ResolvedMatch[]; right: ResolvedMatch[] } {
  const midpoint = Math.ceil(matches.length / 2)
  return {
    left: matches.slice(0, midpoint),
    right: matches.slice(midpoint)
  }
}

function buildBasePositions(count: number, cardHeight: number, gap: number): number[] {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, index) => index * (cardHeight + gap))
}

function buildChildPositions(
  previous: number[],
  count: number,
  fallbackStep: number
): number[] {
  if (count <= 0) return []
  if (previous.length === 0) {
    return Array.from({ length: count }, (_, index) => index * fallbackStep)
  }

  if (previous.length >= 2 && count === Math.ceil(previous.length / 2)) {
    const byPairs: number[] = []
    for (let index = 0; index < previous.length - 1; index += 2) {
      byPairs.push((previous[index] + previous[index + 1]) / 2)
    }
    if (byPairs.length === count) return byPairs
  }

  if (count === 1) {
    const min = previous[0] ?? 0
    const max = previous[previous.length - 1] ?? min
    return [(min + max) / 2]
  }

  const min = previous[0] ?? 0
  const max = previous[previous.length - 1] ?? min
  const span = Math.max(0, max - min)
  const step = span / (count - 1)
  return Array.from({ length: count }, (_, index) => min + step * index)
}

function connectorPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  direction: 'ltr' | 'rtl'
): string {
  const horizontalDelta = Math.abs(endX - startX)
  const bend = Math.max(18, Math.floor(horizontalDelta * 0.42))
  const middleX = direction === 'ltr' ? startX + bend : startX - bend
  return `M ${startX} ${startY} L ${middleX} ${startY} L ${middleX} ${endY} L ${endX} ${endY}`
}

function BracketSummaryPanel({
  rounds,
  activeStage
}: {
  rounds: RoundModel[]
  activeStage: KnockoutStage | null
}) {
  return (
    <div className="space-y-2">
      {rounds.map((round) => (
        <div
          key={`summary-${round.stage}`}
          className={`rounded-xl border p-2.5 ${
            round.stage === activeStage
              ? 'border-[color:var(--tone-info-border)] bg-[color:var(--tone-info-bg-soft)]'
              : 'border-border/50 bg-background/35'
          }`}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-foreground">{STAGE_LABELS[round.stage]}</div>
            <div className="text-[11px] text-muted-foreground">{round.picked}/{round.total}</div>
          </div>
          <div className="space-y-1">
            {round.matches.map((match) => {
              const homeLabel = resolveTeamDisplayLabel(match.homeTeam)
              const awayLabel = resolveTeamDisplayLabel(match.awayTeam)
              return (
                <RowShellV2
                  key={`summary-${round.stage}-${match.match.id}`}
                  tone="inset"
                  interactive={false}
                  className="flex items-center justify-between gap-2 px-2 py-1"
                >
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <TeamIdentityInlineV2
                      code={match.homeTeam.code}
                      name={match.homeTeam.name}
                      label={homeLabel}
                      size="sm"
                    />
                    <span className="shrink-0">vs</span>
                    <TeamIdentityInlineV2
                      code={match.awayTeam.code}
                      name={match.awayTeam.name}
                      label={awayLabel}
                      size="sm"
                    />
                  </div>
                  <StatusTagV2 tone="secondary" className="shrink-0">
                    {resolvePickedWinnerCode(match)}
                  </StatusTagV2>
                </RowShellV2>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function BracketMatchNode({
  node,
  isActiveRound,
  onPick
}: {
  node: BracketNode
  isActiveRound: boolean
  onPick: (match: ResolvedMatch, winner: MatchWinner) => void
}) {
  const { match, interactive, side } = node
  const homeLabel = resolveTeamDisplayLabel(match.homeTeam)
  const awayLabel = resolveTeamDisplayLabel(match.awayTeam)
  const cardShellClass = isActiveRound
    ? 'border-border/24 bg-background/42 shadow-[var(--shadow1)]'
    : 'border-border/12 bg-background/16 shadow-none'
  const metadataTextClass = isActiveRound ? 'text-muted-foreground' : 'text-muted-foreground/55'

  function renderTeamRow(teamSide: MatchWinner, label: string) {
    const selected = match.pickedWinner === teamSide
    const team = teamSide === 'HOME' ? match.homeTeam : match.awayTeam
    const teamIdentityClass = side === 'right' ? 'min-w-0 flex-1 justify-end text-right' : 'min-w-0 flex-1'
    const choiceClass = bracketWinnerChoiceClass({
      selected,
      interactive,
      compact: false
    })
    const choiceStyle = bracketWinnerChoiceStyle(selected, { height: BRACKET_NODE_METRICS.teamRowHeight })

    if (interactive) {
      return (
        <button
          type="button"
          className={choiceClass}
          aria-label={`Set ${label} as winner`}
          aria-pressed={selected}
          style={choiceStyle}
          onClick={() => onPick(match, teamSide)}
        >
          <TeamIdentityInlineV2
            code={team.code}
            name={team.name}
            label={label}
            className={teamIdentityClass}
            size="sm"
          />
          <span className="sr-only">{selected ? 'Selected winner' : 'Not selected'}</span>
        </button>
      )
    }

    return (
      <div
        className={choiceClass}
        style={choiceStyle}
      >
        <TeamIdentityInlineV2
          code={team.code}
          name={team.name}
          label={label}
          className={teamIdentityClass}
          size="sm"
        />
        <span className="sr-only">{selected ? 'Selected winner' : 'Not selected'}</span>
      </div>
    )
  }

  return (
    <article
      className={`h-full overflow-hidden rounded-xl border backdrop-blur-sm ${cardShellClass} ${resultSurfaceClass(match.result)}`}
      style={{
        padding: `${BRACKET_NODE_METRICS.paddingY}px ${BRACKET_NODE_METRICS.paddingX}px`
      }}
      data-stage={match.stage}
    >
      <div className="flex items-center justify-between gap-2 overflow-hidden" style={{ height: BRACKET_NODE_METRICS.headerHeight }}>
        <span className={`truncate text-[11px] font-medium uppercase tracking-[0.1em] ${metadataTextClass}`}>
          {STAGE_SHORT_LABELS[match.stage]}
        </span>
        <span className={`truncate text-[11px] ${metadataTextClass}`}>{formatKickoff(match.match.kickoffUtc)}</span>
      </div>

      <div
        className="flex flex-col"
        style={{
          marginTop: BRACKET_NODE_METRICS.sectionGap,
          rowGap: BRACKET_NODE_METRICS.teamRowGap
        }}
      >
        {renderTeamRow('HOME', homeLabel)}
        {renderTeamRow('AWAY', awayLabel)}
      </div>

      <div
        className="flex min-w-0 items-center justify-between gap-2"
        style={{
          marginTop: BRACKET_NODE_METRICS.sectionGap,
          height: BRACKET_NODE_METRICS.footerHeight
        }}
      >
        {match.result !== 'pending' ? (
          <StatusTagV2
            tone={resultTone(match.result)}
            className={`h-4 shrink-0 px-1.5 text-[9px] ${isActiveRound ? '' : 'opacity-75'}`}
          >
            {resultLabel(match.result)}
          </StatusTagV2>
        ) : null}
      </div>
    </article>
  )
}

function DesktopVisualBracket({
  rounds,
  bracketEditable,
  activeStage,
  onPick
}: {
  rounds: RoundModel[]
  bracketEditable: boolean
  activeStage: KnockoutStage
  onPick: (match: ResolvedMatch, winner: MatchWinner) => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const firstNodeRef = useRef<HTMLDivElement | null>(null)
  const [fitBounds, setFitBounds] = useState<{ availableHeight: number } | null>(null)
  const [supportsResizeObserver, setSupportsResizeObserver] = useState(true)

  const layout = useMemo(() => {
    const byStage = new Map<KnockoutStage, RoundModel>()
    for (const round of rounds) byStage.set(round.stage, round)

    const stageMatches = (stage: KnockoutStage): ResolvedMatch[] => byStage.get(stage)?.matches ?? []

    const { left: leftR32, right: rightR32 } = splitMatches(stageMatches('R32'))
    const { left: leftR16, right: rightR16 } = splitMatches(stageMatches('R16'))
    const { left: leftQF, right: rightQF } = splitMatches(stageMatches('QF'))
    const sfMatches = stageMatches('SF')
    const finalMatch = stageMatches('Final')[0] ?? null
    const thirdMatch = stageMatches('Third')[0] ?? null

    const cardWidth = 208
    const cardHeight = BRACKET_NODE_CARD_HEIGHT
    const rowGap = 14
    const columnGap = 54
    const topPad = 46
    const bottomPad = 12
    const fallbackStep = cardHeight + rowGap

    const leftR32Y = buildBasePositions(leftR32.length, cardHeight, rowGap)
    const leftR16Y = buildChildPositions(leftR32Y, leftR16.length, fallbackStep)
    const leftQfY = buildChildPositions(leftR16Y, leftQF.length, fallbackStep)

    const rightR32Y = buildBasePositions(rightR32.length, cardHeight, rowGap)
    const rightR16Y = buildChildPositions(rightR32Y, rightR16.length, fallbackStep)
    const rightQfY = buildChildPositions(rightR16Y, rightQF.length, fallbackStep)

    const leftSfY = buildChildPositions(leftQfY, sfMatches[0] ? 1 : 0, fallbackStep)
    const rightSfY = buildChildPositions(rightQfY, sfMatches[1] ? 1 : 0, fallbackStep)

    const xStep = cardWidth + columnGap
    const xR32Left = 0
    const xR16Left = xStep
    const xQfLeft = xStep * 2
    const xSfLeft = xStep * 3
    const xFinal = xStep * 4
    const xSfRight = xStep * 5
    const xQfRight = xStep * 6
    const xR16Right = xStep * 7
    const xR32Right = xStep * 8

    const nodes: BracketNode[] = []

    function addStageNodes(
      matches: ResolvedMatch[],
      yPositions: number[],
      x: number,
      side: 'left' | 'right' | 'center'
    ) {
      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index]
        const y = (yPositions[index] ?? 0) + topPad
        const interactive = bracketEditable
        nodes.push({
          id: `${match.stage}-${match.match.id}`,
          match,
          x,
          y,
          side,
          interactive
        })
      }
    }

    addStageNodes(leftR32, leftR32Y, xR32Left, 'left')
    addStageNodes(leftR16, leftR16Y, xR16Left, 'left')
    addStageNodes(leftQF, leftQfY, xQfLeft, 'left')

    if (sfMatches[0]) {
      addStageNodes([sfMatches[0]], leftSfY, xSfLeft, 'center')
    }

    addStageNodes(rightQF, rightQfY, xQfRight, 'right')
    addStageNodes(rightR16, rightR16Y, xR16Right, 'right')
    addStageNodes(rightR32, rightR32Y, xR32Right, 'right')

    if (sfMatches[1]) {
      addStageNodes([sfMatches[1]], rightSfY, xSfRight, 'center')
    }

    const leftSfNode = sfMatches[0]
      ? nodes.find((node) => node.match.match.id === sfMatches[0].match.id) ?? null
      : null
    const rightSfNode = sfMatches[1]
      ? nodes.find((node) => node.match.match.id === sfMatches[1].match.id) ?? null
      : null

    const fallbackFinalY =
      nodes.length > 0
        ? nodes.reduce((sum, node) => sum + node.y, 0) / Math.max(1, nodes.length)
        : topPad

    const finalY =
      leftSfNode && rightSfNode
        ? (leftSfNode.y + rightSfNode.y) / 2
        : leftSfNode
          ? leftSfNode.y
          : rightSfNode
            ? rightSfNode.y
            : fallbackFinalY

    if (finalMatch) {
      const interactive = bracketEditable
      nodes.push({
        id: `${finalMatch.stage}-${finalMatch.match.id}`,
        match: finalMatch,
        x: xFinal,
        y: finalY,
        side: 'center',
        interactive
      })
    }

    const thirdY = finalY + cardHeight + 86

    if (thirdMatch) {
      const interactive = bracketEditable
      nodes.push({
        id: `${thirdMatch.stage}-${thirdMatch.match.id}`,
        match: thirdMatch,
        x: xFinal,
        y: thirdY,
        side: 'center',
        interactive
      })
    }

    function findNode(match: ResolvedMatch): BracketNode | null {
      return nodes.find((node) => node.match.match.id === match.match.id) ?? null
    }

    const connectors: BracketConnector[] = []

    function connect(
      source: BracketNode | null,
      target: BracketNode | null,
      direction: 'ltr' | 'rtl',
      dashed = false
    ) {
      if (!source || !target) return

      const startX = direction === 'ltr' ? source.x + cardWidth : source.x
      const endX = direction === 'ltr' ? target.x : target.x + cardWidth
      const startY = source.y + cardHeight / 2
      const endY = target.y + cardHeight / 2

      connectors.push({
        id: `${source.id}->${target.id}-${direction}-${dashed ? 'd' : 's'}`,
        path: connectorPath(startX, startY, endX, endY, direction),
        sourceStage: source.match.stage,
        targetStage: target.match.stage,
        dashed
      })
    }

    for (let index = 0; index < leftR32.length; index += 1) {
      connect(findNode(leftR32[index]), findNode(leftR16[Math.floor(index / 2)] ?? null), 'ltr')
    }
    for (let index = 0; index < leftR16.length; index += 1) {
      connect(findNode(leftR16[index]), findNode(leftQF[Math.floor(index / 2)] ?? null), 'ltr')
    }
    for (let index = 0; index < leftQF.length; index += 1) {
      connect(findNode(leftQF[index]), leftSfNode, 'ltr')
    }

    for (let index = 0; index < rightR32.length; index += 1) {
      connect(findNode(rightR32[index]), findNode(rightR16[Math.floor(index / 2)] ?? null), 'rtl')
    }
    for (let index = 0; index < rightR16.length; index += 1) {
      connect(findNode(rightR16[index]), findNode(rightQF[Math.floor(index / 2)] ?? null), 'rtl')
    }
    for (let index = 0; index < rightQF.length; index += 1) {
      connect(findNode(rightQF[index]), rightSfNode, 'rtl')
    }

    const finalNode = finalMatch ? findNode(finalMatch) : null
    if (finalNode) {
      connect(leftSfNode, finalNode, 'ltr')
      connect(rightSfNode, finalNode, 'rtl')
    }

    const thirdNode = thirdMatch ? findNode(thirdMatch) : null
    if (thirdNode) {
      connect(leftSfNode, thirdNode, 'ltr', true)
      connect(rightSfNode, thirdNode, 'rtl', true)
    }

    const width = xR32Right + cardWidth
    const maxBottom = nodes.reduce((max, node) => Math.max(max, node.y + cardHeight), 0)
    const minHeight = Math.max(480, maxBottom + bottomPad)

    const labels: Array<{ id: string; label: string; x: number; stage: KnockoutStage }> = [
      { id: 'lbl-r32-l', label: 'Round of 32', x: xR32Left, stage: 'R32' },
      { id: 'lbl-r16-l', label: 'Round of 16', x: xR16Left, stage: 'R16' },
      { id: 'lbl-qf-l', label: 'Quarterfinals', x: xQfLeft, stage: 'QF' },
      { id: 'lbl-sf-l', label: 'Semifinal', x: xSfLeft, stage: 'SF' },
      { id: 'lbl-final', label: 'Final', x: xFinal, stage: 'Final' },
      { id: 'lbl-sf-r', label: 'Semifinal', x: xSfRight, stage: 'SF' },
      { id: 'lbl-r32-r', label: 'Round of 32', x: xR32Right, stage: 'R32' },
      { id: 'lbl-r16-r', label: 'Round of 16', x: xR16Right, stage: 'R16' },
      { id: 'lbl-qf-r', label: 'Quarterfinals', x: xQfRight, stage: 'QF' }
    ]

    return {
      width,
      height: minHeight,
      cardWidth,
      cardHeight,
      nodes,
      connectors,
      labels
    }
  }, [bracketEditable, rounds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.ResizeObserver !== 'function') {
      setSupportsResizeObserver(false)
      return
    }

    const node = viewportRef.current
    if (!node) return

    setSupportsResizeObserver(true)

    const updateBounds = () => {
      const rect = node.getBoundingClientRect()
      const viewportBottomPadding = 20
      const availableHeight = Math.max(0, window.innerHeight - rect.top - viewportBottomPadding)
      setFitBounds({
        availableHeight
      })
    }

    updateBounds()

    const observer = new window.ResizeObserver(() => {
      updateBounds()
    })
    observer.observe(node)

    window.addEventListener('resize', updateBounds)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateBounds)
    }
  }, [layout.height, layout.width])

  if (layout.nodes.length === 0) {
    return (
      <div ref={viewportRef} className="rounded-xl border border-dashed border-border/35 p-4 text-sm text-muted-foreground">
        No bracket fixtures are available in this snapshot.
      </div>
    )
  }

  const shouldUseCompactFallback = !supportsResizeObserver
  const canvasMaxHeight = fitBounds ? Math.max(420, fitBounds.availableHeight) : undefined

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (shouldUseCompactFallback || layout.nodes.length === 0) return
    const node = firstNodeRef.current
    if (!node) return
    const measuredHeight = node.offsetHeight
    if (Math.abs(measuredHeight - layout.cardHeight) > 1) {
      console.warn(
        `[BracketPage] cardHeight mismatch: layout=${layout.cardHeight}px rendered=${measuredHeight}px`
      )
    }
  }, [layout.cardHeight, layout.nodes.length, shouldUseCompactFallback])

  if (shouldUseCompactFallback) {
    return (
      <div ref={viewportRef} className="space-y-2">
        <div className="rounded-lg border border-border/35 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          Compact bracket view enabled for readability on this viewport.
        </div>
        {rounds.map((round) => (
          <div
            key={`desktop-compact-round-${round.stage}`}
            className="rounded-xl border border-border/35 bg-background/30 p-2.5"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground">
                {STAGE_LABELS[round.stage]}
              </div>
              <div className="flex items-center gap-1.5">
                <StatusTagV2 tone={round.editable ? 'secondary' : 'locked'}>
                  {round.editable ? 'Open' : 'Locked'}
                </StatusTagV2>
                <StatusTagV2 tone={round.complete ? 'success' : 'warning'}>
                  {round.picked}/{round.total}
                </StatusTagV2>
              </div>
            </div>

            <div className="space-y-2">
              {round.matches.map((match) => {
                const homeLabel = resolveTeamDisplayLabel(match.homeTeam)
                const awayLabel = resolveTeamDisplayLabel(match.awayTeam)
                return (
                  <div
                    key={`desktop-compact-match-${round.stage}-${match.match.id}`}
                    className={`rounded-lg border border-border/35 p-2.5 ${resultSurfaceClass(match.result)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                          <TeamIdentityInlineV2
                            code={match.homeTeam.code}
                            name={match.homeTeam.name}
                            label={homeLabel}
                          />
                          <span className="shrink-0 text-muted-foreground">vs</span>
                          <TeamIdentityInlineV2
                            code={match.awayTeam.code}
                            name={match.awayTeam.name}
                            label={awayLabel}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">{formatKickoff(match.match.kickoffUtc)}</div>
                      </div>
                      {match.result !== 'pending' ? (
                        <StatusTagV2 tone={resultTone(match.result)}>{resultLabel(match.result)}</StatusTagV2>
                      ) : null}
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        className={bracketWinnerChoiceClass({
                          selected: match.pickedWinner === 'HOME',
                          interactive: true,
                          disabled: !round.editable,
                          compact: true
                        })}
                        style={bracketWinnerChoiceStyle(match.pickedWinner === 'HOME')}
                        disabled={!round.editable}
                        aria-label={`Set ${homeLabel} as winner`}
                        aria-pressed={match.pickedWinner === 'HOME'}
                        onClick={() => onPick(match, 'HOME')}
                      >
                        <TeamIdentityInlineV2
                          code={match.homeTeam.code}
                          name={match.homeTeam.name}
                          label={homeLabel}
                          className="max-w-full flex-1"
                        />
                        <span className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-current/85">advances</span>
                      </button>
                      <button
                        type="button"
                        className={bracketWinnerChoiceClass({
                          selected: match.pickedWinner === 'AWAY',
                          interactive: true,
                          disabled: !round.editable,
                          compact: true
                        })}
                        style={bracketWinnerChoiceStyle(match.pickedWinner === 'AWAY')}
                        disabled={!round.editable}
                        aria-label={`Set ${awayLabel} as winner`}
                        aria-pressed={match.pickedWinner === 'AWAY'}
                        onClick={() => onPick(match, 'AWAY')}
                      >
                        <TeamIdentityInlineV2
                          code={match.awayTeam.code}
                          name={match.awayTeam.name}
                          label={awayLabel}
                          className="max-w-full flex-1"
                        />
                        <span className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-current/85">advances</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const isStageActive = (stage: KnockoutStage) => stage === activeStage

  return (
    <div
      ref={viewportRef}
      className="w-full overflow-x-auto overflow-y-auto pb-1"
      style={{ maxHeight: canvasMaxHeight }}
    >
      <div
        className="relative mx-auto"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          preserveAspectRatio="none"
        >
          {layout.connectors.map((connector) => {
            const touchesActiveStage =
              isStageActive(connector.sourceStage) || isStageActive(connector.targetStage)
            return (
              <path
                key={connector.id}
                d={connector.path}
                fill="none"
                stroke={touchesActiveStage ? 'var(--tone-info-line-active)' : 'var(--tone-info-line)'}
                strokeWidth={touchesActiveStage ? 1.05 : 0.85}
                strokeDasharray={connector.dashed ? '4 4' : undefined}
                strokeLinecap="round"
              />
            )
          })}
        </svg>

        {layout.labels.map((label) => (
          <div
            key={label.id}
            className={`pointer-events-none absolute -translate-x-1/2 text-[12px] font-medium uppercase tracking-[0.1em] ${
              isStageActive(label.stage) ? 'text-muted-foreground' : 'text-muted-foreground/52'
            }`}
            style={{ left: label.x + layout.cardWidth / 2, top: 12 }}
          >
            {label.label}
          </div>
        ))}

        {layout.nodes.map((node, index) => (
          <div
            key={node.id}
            ref={index === 0 ? firstNodeRef : null}
            className="absolute"
            style={{
              left: node.x,
              top: node.y,
              width: layout.cardWidth,
              height: layout.cardHeight
            }}
          >
            <BracketMatchNode
              node={node}
              isActiveRound={isStageActive(node.match.stage)}
              onPick={onPick}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BracketPage() {
  // QA-SMOKE: route=/knockout-bracket and /demo/knockout-bracket ; checklist-id=smoke-knockout-detail
  const location = useLocation()
  const mode = useRouteDataMode()
  const isDemoRoute = location.pathname.startsWith('/demo/')
  const isDesktopViewport = useMediaQuery('(min-width: 768px)')
  const isDesktopRailViewport = useMediaQuery('(min-width: 1024px)')
  const viewerId = useViewerId()
  const { showToast } = useToast()
  const phaseState = useTournamentPhaseState()
  const bracket = useBracketKnockoutData()
  const publishedSnapshot = usePublishedSnapshot()

  const [activeStage, setActiveStage] = useState<KnockoutStage | null>(null)
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false)

  const homePath = isDemoRoute ? '/demo' : '/'

  const readyBracketState = bracket.loadState.status === 'ready' ? bracket.loadState : null
  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const snapshotLabel = formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)

  const drawConfirmed =
    phaseState.tournamentPhase === 'KO_OPEN' ||
    phaseState.tournamentPhase === 'KO_LOCKED' ||
    phaseState.tournamentPhase === 'FINAL'
  const bracketEditable = drawConfirmed && phaseState.lockFlags.bracketEditable
  const showExportMenu = isDesktopViewport && phaseState.lockFlags.exportsVisible

  const rounds = useMemo<RoundModel[]>(() => {
    if (!readyBracketState) return []

    let priorRoundComplete = true
    const resolvedByStage: Partial<Record<KnockoutStage, ResolvedMatch[]>> = {}

    return bracket.stageOrder.map((stage) => {
      const rawMatches = readyBracketState.byStage[stage] ?? []
      const resolvedMatches: ResolvedMatch[] = rawMatches.map((match, index) => {
        const derivedTeams = deriveTeamsForMatch(stage, index, resolvedByStage)
        const homeTeam = derivedTeams.home ?? normalizeTeam(match.homeTeam.code, match.homeTeam.name)
        const awayTeam = derivedTeams.away ?? normalizeTeam(match.awayTeam.code, match.awayTeam.name)
        const pickedWinner = bracket.knockout[stage]?.[match.id]

        return {
          stage,
          index,
          match,
          homeTeam,
          awayTeam,
          pickedWinner,
          result: resolvePredictionResult(match, pickedWinner)
        }
      })

      resolvedByStage[stage] = resolvedMatches

      const total = resolvedMatches.length
      const picked = resolvedMatches.filter((match) => Boolean(match.pickedWinner)).length
      const complete = total === 0 ? true : picked === total
      const unlocked = priorRoundComplete
      const editable = unlocked && bracketEditable
      priorRoundComplete = unlocked && complete

      return {
        stage,
        matches: resolvedMatches,
        picked,
        total,
        complete,
        unlocked,
        editable
      }
    })
  }, [readyBracketState, bracket.stageOrder, bracket.knockout, bracketEditable])

  const loadedRounds = useMemo(() => rounds.filter((round) => round.total > 0), [rounds])

  useEffect(() => {
    if (loadedRounds.length === 0) {
      setActiveStage(null)
      return
    }

    if (activeStage && loadedRounds.some((round) => round.stage === activeStage)) return

    const firstActionable = loadedRounds.find((round) => round.unlocked && !round.complete)
    const firstUnlocked = loadedRounds.find((round) => round.unlocked)
    setActiveStage((firstActionable ?? firstUnlocked ?? loadedRounds[0]).stage)
  }, [activeStage, loadedRounds])

  const activeRound =
    loadedRounds.find((round) => round.stage === activeStage) ??
    loadedRounds[0] ??
    null

  const activeRoundIndex = activeRound
    ? loadedRounds.findIndex((round) => round.stage === activeRound.stage)
    : -1
  const previousRound = activeRoundIndex > 0 ? loadedRounds[activeRoundIndex - 1] : null
  const nextRound =
    activeRoundIndex >= 0 && activeRoundIndex < loadedRounds.length - 1
      ? loadedRounds[activeRoundIndex + 1]
      : null

  const remainingPicks = activeRound ? Math.max(0, activeRound.total - activeRound.picked) : 0

  async function handlePick(match: ResolvedMatch, winner: MatchWinner) {
    bracket.setPick(match.stage, match.match.id, winner)
    const ok = await bracket.save()
    const teamLabel = resolveTeamDisplayLabel(resolveTeamBySide(match, winner))

    showToast({
      tone: ok ? 'success' : 'danger',
      title: ok ? 'Pick saved' : 'Save failed',
      message: ok ? `${teamLabel} set to advance.` : 'Unable to save knockout pick.'
    })
  }

  function jumpToNextRoundOrReview() {
    if (!activeRound || !activeRound.complete) return

    if (nextRound) {
      setActiveStage(nextRound.stage)
      return
    }

    setReviewSheetOpen(true)
  }

  function handleDownloadBracketXlsx() {
    if (!readyBracketState) return

    const exportedAt = new Date().toISOString()
    const rows: string[][] = [
      ['exportedAt', exportedAt],
      ['snapshotAsOf', snapshotReady?.snapshotTimestamp ?? ''],
      ['viewerUserId', viewerId],
      ['mode', mode === 'demo' ? 'demo' : 'prod'],
      [],
      [
        'stage',
        'matchId',
        'kickoffUtc',
        'homeTeam',
        'awayTeam',
        'pickedWinner',
        'pickedWinnerTeamCode',
        'actualWinner',
        'actualWinnerTeamCode',
        'status'
      ]
    ]

    for (const stage of bracket.stageOrder) {
      const stageMatches = readyBracketState.byStage[stage] ?? []
      for (const match of stageMatches) {
        const pickedWinner = bracket.knockout[stage]?.[match.id]
        const status = resolvePredictionResult(match, pickedWinner)
        const pickedWinnerCode =
          pickedWinner === 'HOME'
            ? match.homeTeam.code
            : pickedWinner === 'AWAY'
              ? match.awayTeam.code
              : '—'
        const actualWinnerCode =
          match.winner === 'HOME'
            ? match.homeTeam.code
            : match.winner === 'AWAY'
              ? match.awayTeam.code
              : '—'

        rows.push([
          STAGE_LABELS[stage],
          match.id,
          match.kickoffUtc,
          match.homeTeam.code,
          match.awayTeam.code,
          pickedWinner ?? '',
          pickedWinnerCode,
          match.winner ?? '',
          actualWinnerCode,
          resultLabel(status)
        ])
      }
    }

    const safeViewerId = viewerId.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    const stamp = exportedAt.replace(/[:.]/g, '-')
    const fileName = `knockout-bracket-${safeViewerId || 'viewer'}-${stamp}.xlsx`
    void downloadWorkbook(fileName, [
      {
        name: 'KnockoutBracket',
        rows,
        headerRowIndices: [5]
      }
    ]).catch(() => {
      showToast({ tone: 'danger', title: 'Export failed', message: 'Unable to prepare knockout bracket export.' })
    })
  }

  if (bracket.loadState.status === 'loading' || publishedSnapshot.state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }

  if (bracket.loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load knockout bracket">
        {bracket.loadState.message}
      </Alert>
    )
  }

  if (!drawConfirmed) {
    return (
      <PageShellV2 className="landing-v2-canvas p-4">
        <PageHeaderV2
          variant="hero"
          className="landing-v2-hero"
          kicker="Knockout"
          title="Knockout Bracket"
          subtitle="The knockout bracket opens after the round-of-32 draw is confirmed from fixture data."
          actions={(
            <>
              <ButtonLink to={homePath} size="sm" variant="secondary">
                Back to Play Center
              </ButtonLink>
            </>
          )}
          metadata={<SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />}
        />

        <SectionCardV2 tone="panel" className="p-4 md:p-5">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">Bracket not available yet</div>
            <div className="text-sm text-muted-foreground">
              Stay on this page. Your guided winners-only bracket will unlock automatically once the draw is confirmed.
            </div>
            <SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />
          </div>
        </SectionCardV2>
      </PageShellV2>
    )
  }

  return (
    <PageShellV2 className="landing-v2-canvas p-4">
      <PageHeaderV2
        variant="hero"
        className="landing-v2-hero"
        kicker="Knockout"
        title="Knockout Bracket"
        subtitle="Pick one active round at a time. Your selections flow through the visual bracket."
        actions={(
          <>
            <ButtonLink to={homePath} size="sm" variant="secondary">
              Back to Play Center
            </ButtonLink>
            {showExportMenu ? (
              <ExportMenuV2
                contextLabel="Download your knockout bracket workbook from the latest snapshot."
                snapshotLabel={`Snapshot ${snapshotLabel}`}
                onDownloadXlsx={handleDownloadBracketXlsx}
              />
            ) : null}
          </>
        )}
        metadata={
          <>
            <SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{phaseState.tournamentPhase === 'FINAL' ? 'Status FINAL' : 'Status PROVISIONAL'}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{bracketEditable ? 'Bracket open for edits' : 'Bracket locked for all rounds'}</span>
          </>
        }
      />

      {loadedRounds.length === 0 || !activeRound ? (
        <SectionCardV2 tone="panel" className="p-4 md:p-5">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">No knockout fixtures available</div>
            <div className="text-sm text-muted-foreground">
              Fixture data does not include knockout rounds yet for this snapshot.
            </div>
            <SnapshotStamp timestamp={snapshotReady?.snapshotTimestamp} prefix="Snapshot " />
          </div>
        </SectionCardV2>
      ) : isDesktopRailViewport ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Knockout bracket</div>
            </div>
            <div className="flex items-center gap-2">
              {!bracketEditable ? (
                <Badge tone="locked">Read-only bracket</Badge>
              ) : (
                <Badge tone="secondary">PICKS OPEN NOW</Badge>
              )}
            </div>
          </div>

          <DesktopVisualBracket
            rounds={loadedRounds}
            bracketEditable={bracketEditable}
            activeStage={activeRound.stage}
            onPick={(match, winner) => {
              void handlePick(match, winner)
            }}
          />
        </div>
      ) : (
        <div className="space-y-3 pb-28">
          <SectionCardV2 tone="panel" className="p-3 md:p-4">
            <div className="space-y-2">
              <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Rounds</div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {loadedRounds.map((round) => (
                  <button
                    key={`stage-step-${round.stage}`}
                    type="button"
                    className={`shrink-0 rounded-lg border px-2 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      round.stage === activeRound.stage
                        ? 'border-[color:var(--tone-info-border)] bg-[color:var(--tone-info-bg-soft)] text-foreground'
                        : round.complete
                          ? 'border-[color:var(--tone-success-border)] bg-[color:var(--tone-success-bg-soft)] text-foreground'
                          : 'border-border/42 bg-background/25 text-muted-foreground'
                    }`}
                    disabled={!(round.unlocked || round.complete || round.stage === activeRound.stage)}
                    onClick={() => setActiveStage(round.stage)}
                  >
                    {STAGE_SHORT_LABELS[round.stage]}
                  </button>
                ))}
              </div>
            </div>
          </SectionCardV2>

          <SectionCardV2 tone="panel" className="p-3 md:p-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="v2-heading-h2 text-foreground">{STAGE_LABELS[activeRound.stage]}</h2>
                  <div className="text-sm text-muted-foreground">
                    {activeRound.picked} of {activeRound.total} picked
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={activeRound.complete ? 'success' : 'warning'}>
                    {activeRound.complete ? 'Round complete' : `${remainingPicks} remaining`}
                  </Badge>
                  <Badge tone={activeRound.editable ? 'secondary' : 'locked'}>
                    {activeRound.editable ? 'Open' : 'Locked'}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-border/34 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                {roundHelperCopy(activeRound, nextRound, bracketEditable)}
              </div>

              <div className="space-y-2">
                {activeRound.matches.map((match) => (
                  <div
                    key={`${activeRound.stage}-${match.match.id}`}
                    className={`rounded-xl border border-border/35 p-2.5 ${resultSurfaceClass(match.result)}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                            <TeamIdentityInlineV2
                              code={match.homeTeam.code}
                              name={match.homeTeam.name}
                              label={resolveTeamDisplayLabel(match.homeTeam)}
                            />
                            <span className="shrink-0 text-muted-foreground">vs</span>
                            <TeamIdentityInlineV2
                              code={match.awayTeam.code}
                              name={match.awayTeam.name}
                              label={resolveTeamDisplayLabel(match.awayTeam)}
                            />
                          </div>
                          <div className="text-[11px] text-muted-foreground">{formatKickoff(match.match.kickoffUtc)}</div>
                        </div>
                        {match.result !== 'pending' ? (
                          <Badge tone={resultTone(match.result)}>{resultLabel(match.result)}</Badge>
                        ) : null}
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className={bracketWinnerChoiceClass({
                            selected: match.pickedWinner === 'HOME',
                            interactive: true,
                            disabled: !activeRound.editable,
                            compact: true
                          })}
                          style={bracketWinnerChoiceStyle(match.pickedWinner === 'HOME')}
                          disabled={!activeRound.editable}
                          aria-label={`Set ${resolveTeamDisplayLabel(match.homeTeam)} as winner`}
                          aria-pressed={match.pickedWinner === 'HOME'}
                          onClick={() => void handlePick(match, 'HOME')}
                        >
                          <TeamIdentityInlineV2
                            code={match.homeTeam.code}
                            name={match.homeTeam.name}
                            label={resolveTeamDisplayLabel(match.homeTeam)}
                            className="max-w-full flex-1"
                          />
                          <span className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-current/85">advances</span>
                        </button>
                        <button
                          type="button"
                          className={bracketWinnerChoiceClass({
                            selected: match.pickedWinner === 'AWAY',
                            interactive: true,
                            disabled: !activeRound.editable,
                            compact: true
                          })}
                          style={bracketWinnerChoiceStyle(match.pickedWinner === 'AWAY')}
                          disabled={!activeRound.editable}
                          aria-label={`Set ${resolveTeamDisplayLabel(match.awayTeam)} as winner`}
                          aria-pressed={match.pickedWinner === 'AWAY'}
                          onClick={() => void handlePick(match, 'AWAY')}
                        >
                          <TeamIdentityInlineV2
                            code={match.awayTeam.code}
                            name={match.awayTeam.name}
                            label={resolveTeamDisplayLabel(match.awayTeam)}
                            className="max-w-full flex-1"
                          />
                          <span className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-current/85">advances</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCardV2>
        </div>
      )}

      {!isDesktopRailViewport && activeRound ? (
        <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+0.35rem)] z-40 px-3 lg:hidden">
          <div className="rounded-xl border border-border/34 bg-background/90 p-2.5 shadow-[var(--shadow1)] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                disabled={!previousRound}
                onClick={() => previousRound && setActiveStage(previousRound.stage)}
              >
                Back
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="flex-[1.4]"
                disabled={!activeRound.complete}
                onClick={jumpToNextRoundOrReview}
              >
                {primaryCtaLabel(activeRound, nextRound)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!isDesktopRailViewport ? (
        <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
          <SheetContent side="bottom" className="max-h-[82dvh] rounded-t-2xl p-0">
            <SheetHeader>
              <SheetTitle>Bracket Review</SheetTitle>
              <SheetDescription>Review your full knockout path from your current picks.</SheetDescription>
            </SheetHeader>
            <div className="overflow-auto p-3">
              <BracketSummaryPanel rounds={loadedRounds} activeStage={activeRound?.stage ?? null} />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </PageShellV2>
  )
}
