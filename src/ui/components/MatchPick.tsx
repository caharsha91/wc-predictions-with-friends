import { useEffect, useMemo, useRef } from 'react'

import { cn } from '../lib/utils'
import { resolveSemanticState, type SemanticState } from '../lib/semanticState'
import { UNKNOWN_FLAG_ASSET_PATH } from '../lib/teamFlag'
import { clampScore, getWinnerId, isDraw, parseInputScore } from '../lib/matchPickLogic'
import { Input } from './ui/Input'
import FlagBadgeV2 from './v2/FlagBadgeV2'
import RowShellV2 from './v2/RowShellV2'

export type MatchPickDecidedIn = 'REG' | 'AET' | 'PEN'
export type MatchPickSelectionResult = 'correct' | 'wrong' | 'pending'

export type MatchPickTeam = {
  id: string
  name: string
  flagUrl?: string
  abbr?: string
}

export type MatchPickChange = {
  matchId: string
  scoreA: number | undefined
  scoreB: number | undefined
  decidedIn: MatchPickDecidedIn
  selectedWinnerId?: string
}

export type MatchPickProps = {
  matchId: string
  isKnockout: boolean
  teamA: MatchPickTeam
  teamB: MatchPickTeam
  scoreA: number | undefined
  scoreB: number | undefined
  decidedIn: MatchPickDecidedIn
  selectedWinnerId?: string
  onChange: (next: MatchPickChange) => void
  disabled?: boolean
  rowState?: SemanticState | 'selected'
  knockoutDrawEnabled?: boolean
  selectionResult?: MatchPickSelectionResult
}

export { isDraw, getWinnerId } from '../lib/matchPickLogic'

function segmentClass(selected: boolean, disabled: boolean): string {
  return cn(
    'v2-track-10 v2-type-chip inline-flex h-9 min-w-[3.2rem] flex-1 items-center justify-center rounded-md px-2 font-medium uppercase transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-strong)] focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    selected
      ? 'bg-[var(--surface-1)] text-foreground shadow-[inset_0_0_0_1px_var(--border-subtle)]'
      : 'text-muted-foreground',
    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-[var(--surface-1)] hover:text-foreground'
  )
}

function TeamButton({
  team,
  activeTone,
  selectionResult,
  interactive,
  selected,
  onSelect
}: {
  team: MatchPickTeam
  activeTone: 'score' | 'manual' | null
  selectionResult: MatchPickSelectionResult
  interactive: boolean
  selected: boolean
  onSelect: () => void
}) {
  const selectedSurfaceClass = selected
    ? selectionResult === 'correct'
      ? 'border-[var(--hl-success-border)] bg-[var(--hl-success-bg)] shadow-[inset_0_0_0_1px_var(--hl-success-border-soft)]'
      : selectionResult === 'wrong'
        ? 'border-[var(--hl-conflict-border)] bg-[var(--hl-conflict-bg)] shadow-[inset_0_0_0_1px_var(--hl-conflict-border-soft)]'
        : activeTone === 'manual'
          ? 'border-[var(--hl-warning-border)] bg-[var(--hl-warning-bg)] shadow-[inset_0_0_0_1px_var(--hl-warning-border-soft)]'
          : activeTone === 'score'
            ? 'border-[var(--hl-selection-border)] bg-[var(--hl-selection-bg)] shadow-[inset_0_0_0_1px_var(--hl-selection-border-soft)]'
            : 'border-[var(--border-subtle)] bg-[var(--surface-2)]'
    : 'border-[var(--border-subtle)] bg-[var(--surface-2)]'

  const baseClass = cn(
    'flex w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left transition-all',
    interactive
      ? 'cursor-pointer hover:-translate-y-px hover:bg-[var(--surface-1)]'
      : 'cursor-default',
    selectedSurfaceClass
  )

  const content = (
    <>
      <FlagBadgeV2
        src={team.flagUrl ?? UNKNOWN_FLAG_ASSET_PATH}
        fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
        size="xs"
        className="rounded-sm"
      />
      <span className="min-w-0">
        <span className="v2-type-body-sm block truncate font-semibold text-foreground">{team.abbr ?? team.name}</span>
        {team.abbr && team.abbr !== team.name ? (
          <span className="v2-type-caption block truncate">{team.name}</span>
        ) : null}
      </span>
    </>
  )

  if (!interactive) {
    return <div className={baseClass}>{content}</div>
  }

  return (
    <button
      type="button"
      className={baseClass}
      aria-pressed={selected}
      aria-label={`Select ${team.name} as eventual winner`}
      onClick={onSelect}
    >
      {content}
    </button>
  )
}

export default function MatchPick({
  matchId,
  isKnockout,
  teamA,
  teamB,
  scoreA,
  scoreB,
  decidedIn,
  selectedWinnerId,
  onChange,
  disabled = false,
  rowState,
  knockoutDrawEnabled,
  selectionResult = 'pending'
}: MatchPickProps) {
  const hasScores = typeof scoreA === 'number' && typeof scoreB === 'number'
  const draw = isDraw(scoreA, scoreB)
  const knockoutDrawByScore = isKnockout && draw
  const knockoutDraw = knockoutDrawEnabled ?? knockoutDrawByScore

  const winnerId = useMemo(
    () =>
      getWinnerId({
        isKnockout,
        teamAId: teamA.id,
        teamBId: teamB.id,
        scoreA,
        scoreB,
        selectedWinnerId
      }),
    [isKnockout, scoreA, scoreB, selectedWinnerId, teamA.id, teamB.id]
  )

  const lastAutoNormalizeKeyRef = useRef<string | null>(null)
  const latestInteractionRef = useRef<{
    scoreA: number | undefined
    scoreB: number | undefined
    decidedIn: MatchPickDecidedIn
    selectedWinnerId?: string
  }>({
    scoreA,
    scoreB,
    decidedIn,
    selectedWinnerId
  })

  useEffect(() => {
    latestInteractionRef.current = {
      scoreA,
      scoreB,
      decidedIn,
      selectedWinnerId
    }
  }, [decidedIn, scoreA, scoreB, selectedWinnerId])

  useEffect(() => {
    const hasManualSelection = Boolean(selectedWinnerId)
    if (!hasManualSelection) {
      lastAutoNormalizeKeyRef.current = null
      return
    }

    const winnerIsKnownTeam = selectedWinnerId === teamA.id || selectedWinnerId === teamB.id
    const shouldClearSelection = !knockoutDraw || !winnerIsKnownTeam
    if (!shouldClearSelection) {
      lastAutoNormalizeKeyRef.current = null
      return
    }

    const key = `${matchId}:${scoreA}:${scoreB}:${selectedWinnerId}:${teamA.id}:${teamB.id}:${knockoutDraw}`
    if (lastAutoNormalizeKeyRef.current === key) return
    lastAutoNormalizeKeyRef.current = key

    latestInteractionRef.current = {
      scoreA,
      scoreB,
      decidedIn,
      selectedWinnerId: undefined
    }

    onChange({
      matchId,
      scoreA,
      scoreB,
      decidedIn,
      selectedWinnerId: undefined
    })
  }, [decidedIn, knockoutDraw, matchId, onChange, scoreA, scoreB, selectedWinnerId, teamA.id, teamB.id])

  function emit(next: {
    scoreA?: number | undefined
    scoreB?: number | undefined
    decidedIn?: MatchPickDecidedIn
    selectedWinnerId?: string
  }) {
    const latest = latestInteractionRef.current
    const nextScoreA =
      Object.prototype.hasOwnProperty.call(next, 'scoreA')
        ? (typeof next.scoreA === 'number' ? clampScore(next.scoreA) : undefined)
        : latest.scoreA
    const nextScoreB =
      Object.prototype.hasOwnProperty.call(next, 'scoreB')
        ? (typeof next.scoreB === 'number' ? clampScore(next.scoreB) : undefined)
        : latest.scoreB
    const nextKnockoutDraw = isKnockout && isDraw(nextScoreA, nextScoreB)
    const nextDecidedIn = nextKnockoutDraw ? (next.decidedIn ?? latest.decidedIn) : 'REG'
    const requestedWinnerId =
      Object.prototype.hasOwnProperty.call(next, 'selectedWinnerId')
        ? next.selectedWinnerId
        : latest.selectedWinnerId
    const nextSelectedWinnerId =
      nextKnockoutDraw && (requestedWinnerId === teamA.id || requestedWinnerId === teamB.id)
        ? requestedWinnerId
        : undefined

    latestInteractionRef.current = {
      scoreA: nextScoreA,
      scoreB: nextScoreB,
      decidedIn: nextDecidedIn,
      selectedWinnerId: nextSelectedWinnerId
    }

    onChange({
      matchId,
      scoreA: nextScoreA,
      scoreB: nextScoreB,
      decidedIn: nextDecidedIn,
      selectedWinnerId: nextSelectedWinnerId
    })
  }

  const teamAActiveTone: 'score' | 'manual' | null =
    winnerId === teamA.id ? (draw ? 'manual' : 'score') : null
  const teamBActiveTone: 'score' | 'manual' | null =
    winnerId === teamB.id ? (draw ? 'manual' : 'score') : null
  const isTeamASelected = winnerId === teamA.id
  const isTeamBSelected = winnerId === teamB.id
  const hasKnockoutMethod = decidedIn === 'AET' || decidedIn === 'PEN'
  const resolvedRowState =
    rowState === 'selected'
      ? 'selection'
      : (rowState ?? resolveSemanticState({ disabled, selected: Boolean(winnerId) }))

  return (
    <RowShellV2
      depth="embedded"
      state={resolvedRowState}
      className="px-2.5 py-2"
      style={{ borderColor: 'var(--border-subtle)' }}
      aria-label={`${teamA.name} versus ${teamB.name} match pick`}
    >
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-2.5',
          isKnockout
            ? 'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]'
            : 'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
        )}
      >
        <TeamButton
          team={teamA}
          activeTone={teamAActiveTone}
          selectionResult={selectionResult}
          interactive={knockoutDraw && !disabled}
          selected={isTeamASelected}
          onSelect={() => emit({ selectedWinnerId: teamA.id })}
        />

        <div className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-3)] p-1">
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={typeof scoreA === 'number' ? String(scoreA) : ''}
            onChange={(event) => emit({ scoreA: parseInputScore(event.target.value) })}
            disabled={disabled}
            className="v2-type-body-sm h-8 w-12 border-transparent bg-transparent px-1 py-1 text-center tabular-nums shadow-none focus-visible:ring-offset-0 focus-visible:shadow-none"
            aria-label={`${teamA.name} score`}
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            -
          </span>
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={typeof scoreB === 'number' ? String(scoreB) : ''}
            onChange={(event) => emit({ scoreB: parseInputScore(event.target.value) })}
            disabled={disabled}
            className="v2-type-body-sm h-8 w-12 border-transparent bg-transparent px-1 py-1 text-center tabular-nums shadow-none focus-visible:ring-offset-0 focus-visible:shadow-none"
            aria-label={`${teamB.name} score`}
          />
        </div>

        <TeamButton
          team={teamB}
          activeTone={teamBActiveTone}
          selectionResult={selectionResult}
          interactive={knockoutDraw && !disabled}
          selected={isTeamBSelected}
          onSelect={() => emit({ selectedWinnerId: teamB.id })}
        />

        {isKnockout ? (
          <div className="col-span-full flex min-h-9 items-center justify-end md:col-auto md:min-w-[126px]">
            {knockoutDraw ? (
              <div className="inline-flex w-full items-center rounded-lg bg-[var(--surface-3)] p-0.5 md:w-auto">
                <button
                  type="button"
                  className={segmentClass(decidedIn === 'AET', disabled)}
                  onClick={() => !disabled && emit({ decidedIn: 'AET' })}
                  disabled={disabled}
                  aria-label="Set decided in AET"
                  aria-pressed={decidedIn === 'AET'}
                >
                  AET
                </button>
                <button
                  type="button"
                  className={segmentClass(decidedIn === 'PEN', disabled)}
                  onClick={() => !disabled && emit({ decidedIn: 'PEN' })}
                  disabled={disabled}
                  aria-label="Set decided in penalties"
                  aria-pressed={decidedIn === 'PEN'}
                >
                  PEN
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {isKnockout && hasScores && knockoutDraw && (!winnerId || !hasKnockoutMethod) ? (
        <p className="v2-type-caption mt-1">Draw picked. Choose eventual winner and AET/PEN.</p>
      ) : null}
    </RowShellV2>
  )
}
