import type { TournamentPhase } from './tournamentPhase'

export function publishedStateLabel(phase: TournamentPhase): string {
  return phase === 'FINAL' ? 'Published: Final' : 'Published: Latest snapshot'
}

export function lockedFinalLabel(phase: TournamentPhase): string {
  return phase === 'FINAL' ? 'Locked: Final.' : 'Locked.'
}
