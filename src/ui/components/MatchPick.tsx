import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'

import { cn } from '../lib/utils'
import { UNKNOWN_FLAG_ASSET_PATH } from '../lib/teamFlag'
import { Input } from './ui/Input'
import FlagBadgeV2 from './v2/FlagBadgeV2'
import RowShellV2 from './v2/RowShellV2'

export type MatchPickDecidedIn = 'REG' | 'AET' | 'PEN'

export type MatchPickTeam = {
  id: string
  name: string
  flagUrl?: string
  abbr?: string
}

export type MatchPickChange = {
  matchId: string
  scoreA: number
  scoreB: number
  decidedIn: MatchPickDecidedIn
  selectedWinnerId?: string
}

export type MatchPickProps = {
  matchId: string
  isKnockout: boolean
  teamA: MatchPickTeam
  teamB: MatchPickTeam
  scoreA: number
  scoreB: number
  decidedIn: MatchPickDecidedIn
  selectedWinnerId?: string
  onChange: (next: MatchPickChange) => void
  disabled?: boolean
  rowState?: 'default' | 'selected' | 'disabled'
  knockoutDrawEnabled?: boolean
}

const SCORE_GLOW_STYLE: CSSProperties = {
  boxShadow: '0 0 15px rgba(var(--info-rgb),0.65), inset 0 0 0 1px rgba(var(--info-rgb),0.42)'
}

const MANUAL_GLOW_STYLE: CSSProperties = {
  boxShadow: '0 0 15px rgba(var(--warn-rgb),0.58), inset 0 0 0 1px rgba(var(--warn-rgb),0.42)'
}

export function isDraw(scoreA: number, scoreB: number): boolean {
  return scoreA === scoreB
}

export function getWinnerId({
  isKnockout,
  teamAId,
  teamBId,
  scoreA,
  scoreB,
  selectedWinnerId
}: {
  isKnockout: boolean
  teamAId: string
  teamBId: string
  scoreA: number
  scoreB: number
  selectedWinnerId?: string
}): string | undefined {
  if (scoreA > scoreB) return teamAId
  if (scoreB > scoreA) return teamBId
  if (!isKnockout) return undefined
  if (selectedWinnerId === teamAId || selectedWinnerId === teamBId) return selectedWinnerId
  return undefined
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

function parseInputScore(raw: string, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return clampScore(parsed)
}

function segmentClass(selected: boolean, disabled: boolean): string {
  return cn(
    'inline-flex h-9 min-w-[3.2rem] flex-1 items-center justify-center rounded-md px-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors',
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
  interactive,
  selected,
  onSelect
}: {
  team: MatchPickTeam
  activeTone: 'score' | 'manual' | null
  interactive: boolean
  selected: boolean
  onSelect: () => void
}) {
  const baseClass = cn(
    'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-all',
    'bg-[var(--surface-2)]',
    interactive
      ? 'cursor-pointer hover:-translate-y-px hover:bg-[var(--surface-1)]'
      : 'cursor-default',
    activeTone === 'score' ? 'bg-[rgba(var(--info-rgb),0.12)]' : undefined,
    activeTone === 'manual' ? 'bg-[rgba(var(--warn-rgb),0.12)]' : undefined
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
        <span className="block truncate text-[12px] font-semibold text-foreground">{team.abbr ?? team.name}</span>
        {team.abbr && team.abbr !== team.name ? (
          <span className="block truncate text-[10px] text-muted-foreground">{team.name}</span>
        ) : null}
      </span>
    </>
  )

  if (!interactive) {
    return (
      <div className={baseClass} style={activeTone === 'manual' ? MANUAL_GLOW_STYLE : activeTone === 'score' ? SCORE_GLOW_STYLE : undefined}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={baseClass}
      aria-pressed={selected}
      aria-label={`Select ${team.name} as eventual winner`}
      onClick={onSelect}
      style={activeTone === 'manual' ? MANUAL_GLOW_STYLE : activeTone === 'score' ? SCORE_GLOW_STYLE : undefined}
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
  knockoutDrawEnabled
}: MatchPickProps) {
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

    onChange({
      matchId,
      scoreA,
      scoreB,
      decidedIn,
      selectedWinnerId: undefined
    })
  }, [decidedIn, knockoutDraw, matchId, onChange, scoreA, scoreB, selectedWinnerId, teamA.id, teamB.id])

  function emit(next: {
    scoreA?: number
    scoreB?: number
    decidedIn?: MatchPickDecidedIn
    selectedWinnerId?: string
  }) {
    const nextScoreA = clampScore(next.scoreA ?? scoreA)
    const nextScoreB = clampScore(next.scoreB ?? scoreB)
    const nextKnockoutDraw = isKnockout && isDraw(nextScoreA, nextScoreB)
    const nextDecidedIn = next.decidedIn ?? decidedIn
    const requestedWinnerId = next.selectedWinnerId ?? selectedWinnerId
    const nextSelectedWinnerId =
      nextKnockoutDraw && (requestedWinnerId === teamA.id || requestedWinnerId === teamB.id)
        ? requestedWinnerId
        : undefined

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

  return (
    <RowShellV2
      state={rowState ?? (disabled ? 'disabled' : winnerId ? 'selected' : 'default')}
      className="px-2.5 py-2"
      style={{ borderColor: 'var(--border-subtle)' }}
      aria-label={`${teamA.name} versus ${teamB.name} match pick`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:gap-2.5">
        <TeamButton
          team={teamA}
          activeTone={teamAActiveTone}
          interactive={knockoutDraw && !disabled}
          selected={selectedWinnerId === teamA.id}
          onSelect={() => emit({ selectedWinnerId: teamA.id })}
        />

        <div className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-3)] p-1">
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={String(scoreA)}
            onChange={(event) => emit({ scoreA: parseInputScore(event.target.value, scoreA) })}
            disabled={disabled}
            className="h-8 w-12 border-transparent bg-transparent px-1 py-1 text-center text-[13px] tabular-nums shadow-none focus-visible:ring-offset-0 focus-visible:shadow-none"
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
            value={String(scoreB)}
            onChange={(event) => emit({ scoreB: parseInputScore(event.target.value, scoreB) })}
            disabled={disabled}
            className="h-8 w-12 border-transparent bg-transparent px-1 py-1 text-center text-[13px] tabular-nums shadow-none focus-visible:ring-offset-0 focus-visible:shadow-none"
            aria-label={`${teamB.name} score`}
          />
        </div>

        <TeamButton
          team={teamB}
          activeTone={teamBActiveTone}
          interactive={knockoutDraw && !disabled}
          selected={selectedWinnerId === teamB.id}
          onSelect={() => emit({ selectedWinnerId: teamB.id })}
        />

        <div className="col-span-full flex min-h-9 items-center justify-end md:col-auto md:min-w-[126px]">
          <div className="inline-flex w-full items-center rounded-lg bg-[var(--surface-3)] p-0.5 md:w-auto">
            <button
              type="button"
              className={segmentClass(decidedIn === 'AET', !knockoutDraw || disabled)}
              onClick={() => knockoutDraw && !disabled && emit({ decidedIn: 'AET' })}
              disabled={!knockoutDraw || disabled}
              aria-label="Set decided in AET"
              aria-pressed={decidedIn === 'AET'}
            >
              AET
            </button>
            <button
              type="button"
              className={segmentClass(decidedIn === 'PEN', !knockoutDraw || disabled)}
              onClick={() => knockoutDraw && !disabled && emit({ decidedIn: 'PEN' })}
              disabled={!knockoutDraw || disabled}
              aria-label="Set decided in penalties"
              aria-pressed={decidedIn === 'PEN'}
            >
              PEN
            </button>
          </div>
        </div>
      </div>

      {knockoutDraw && !winnerId ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Draw - select eventual winner</p>
      ) : null}
    </RowShellV2>
  )
}
