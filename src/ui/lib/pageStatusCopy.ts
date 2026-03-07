import type { TournamentPhase } from './tournamentPhase'

export const SNAPSHOT_METADATA_PREFIX = 'Latest snapshot: '
export const EXPORT_MENU_TITLE = 'Workbook export'
export const EXPORT_MENU_ACTION_LABEL = 'Download .xlsx now'
export const EXPORT_MENU_ACTION_HINT = 'Click to start the file download'

export function publishedStateLabel(phase: TournamentPhase): string {
  return phase === 'FINAL' ? 'Published: Final' : 'Published: Latest snapshot'
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
