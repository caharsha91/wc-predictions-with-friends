import type { TournamentPhase } from './tournamentPhase'

export const SNAPSHOT_METADATA_PREFIX = 'Latest snapshot: '
export const UPDATED_METADATA_LABEL = 'Updated'
export const EXPORT_MENU_TITLE = 'Workbook export'
export const EXPORT_MENU_ACTION_LABEL = 'Download .xlsx now'
export const EXPORT_MENU_ACTION_HINT = 'Click to start the file download'

type LockReason = 'kickoff' | 'group-lock' | 'draw-unconfirmed' | 'results-final' | 'round'

export function adminPublishedLabel(phase: TournamentPhase): string {
  return phase === 'FINAL' ? 'Published: Final' : 'Published: Latest snapshot'
}

// Backward-compatible alias while player-facing surfaces migrate away from "Published".
export const publishedStateLabel = adminPublishedLabel

export function openUntilLabel(value: string): string {
  return `Open until ${value}`
}

export function opensAfterLabel(event: string): string {
  return `Opens after ${event}`
}

export function resultsFinalLabel(): string {
  return 'Results final'
}

export function noPicksOpenLabel(): string {
  return 'No picks open right now'
}

export function lockedLabel({
  time,
  reason
}: {
  time?: string | null
  reason?: LockReason
}): string {
  if (reason === 'kickoff') return 'Locked after kickoff'
  if (reason === 'group-lock') return 'Locked after group lock'
  if (reason === 'draw-unconfirmed') return 'Locked until the draw is confirmed'
  if (reason === 'results-final') return 'Locked because results are final'
  if (reason === 'round') return 'Locked for this round'
  if (time) return `Locked ${time}`
  return 'Locked for now'
}

export function lockedFinalLabel(phase: TournamentPhase): string {
  return phase === 'FINAL' ? 'Locked: Final.' : 'Locked.'
}

export function editableUntilLabel(value: string): string {
  return `Editable until: ${value}.`
}

export function lockedAtLabel(value: string): string {
  return `Locked: Bracket edits closed at ${value}.`
}
