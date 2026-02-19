import type { Match } from '../../types/matches'

export type TournamentPhase =
  | 'PRE_GROUP'
  | 'GROUP_OPEN'
  | 'GROUP_LOCKED'
  | 'KO_OPEN'
  | 'KO_LOCKED'
  | 'FINAL'

export type PhaseEngineMode = 'prod' | 'demo'

export type LockFlags = {
  groupLocked: boolean
  knockoutLocked: boolean
  picksHidden: boolean
  rivalsComparisonVisible: boolean
  exportsVisible: boolean
  groupEditable: boolean
  matchPicksEditable: boolean
  bracketEditable: boolean
}

export type SnapshotFields = {
  snapshotPublishedAt?: string | null
  snapshotPhase?: TournamentPhase | null
  snapshotGroupLocked?: boolean | null
  snapshotKoLocked?: boolean | null
  snapshotFinalized?: boolean | null
}

export type ComputeTournamentPhaseInputs = {
  mode: PhaseEngineMode
  nowUtc: string
  deadlines: {
    groupStageDeadlineUtc: string
    firstKoKickoffUtc?: string | null
  }
  koDrawConfirmedSignal: boolean
  snapshotFields: SnapshotFields
  selectedDemoPhase: TournamentPhase | null
  demoOverride: TournamentPhase | null
}

export type TournamentPhaseState = {
  tournamentPhase: TournamentPhase
  lockFlags: LockFlags
  computedAt: string
}

function parseUtcMs(utcIso?: string | null): number | null {
  if (!utcIso) return null
  const timestamp = new Date(utcIso).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function isValidPhase(value: string | null | undefined): value is TournamentPhase {
  return (
    value === 'PRE_GROUP' ||
    value === 'GROUP_OPEN' ||
    value === 'GROUP_LOCKED' ||
    value === 'KO_OPEN' ||
    value === 'KO_LOCKED' ||
    value === 'FINAL'
  )
}

function resolvePhaseFromSnapshot(snapshotFields: SnapshotFields): TournamentPhase | null {
  if (snapshotFields.snapshotFinalized === true) return 'FINAL'

  if (snapshotFields.snapshotPhase !== null && snapshotFields.snapshotPhase !== undefined) {
    return isValidPhase(snapshotFields.snapshotPhase) ? snapshotFields.snapshotPhase : null
  }

  if (snapshotFields.snapshotKoLocked === true) return 'KO_LOCKED'
  if (snapshotFields.snapshotGroupLocked === true) return 'GROUP_LOCKED'
  return null
}

function resolveDeadlineFallbackPhase({
  nowMs,
  groupStageDeadlineMs,
  firstKoKickoffMs,
  koDrawConfirmedSignal,
  mode
}: {
  nowMs: number
  groupStageDeadlineMs: number | null
  firstKoKickoffMs: number | null
  koDrawConfirmedSignal: boolean
  mode: PhaseEngineMode
}): TournamentPhase {
  if (koDrawConfirmedSignal) {
    if (mode === 'prod' && firstKoKickoffMs === null) return 'KO_LOCKED'
    if (firstKoKickoffMs !== null && nowMs >= firstKoKickoffMs) return 'KO_LOCKED'
    return 'KO_OPEN'
  }

  if (groupStageDeadlineMs !== null) {
    return nowMs >= groupStageDeadlineMs ? 'GROUP_LOCKED' : 'GROUP_OPEN'
  }

  return 'PRE_GROUP'
}

function resolveLockFlags(phase: TournamentPhase): LockFlags {
  const groupLocked = phase === 'GROUP_LOCKED' || phase === 'KO_OPEN' || phase === 'KO_LOCKED' || phase === 'FINAL'
  const knockoutLocked = phase !== 'KO_OPEN'
  const picksHidden = phase === 'PRE_GROUP' || phase === 'GROUP_OPEN'
  const exportsVisible = phase === 'GROUP_LOCKED' || phase === 'KO_OPEN' || phase === 'KO_LOCKED' || phase === 'FINAL'
  const groupEditable = phase === 'PRE_GROUP' || phase === 'GROUP_OPEN'
  const matchPicksEditable = phase !== 'FINAL'
  const bracketEditable = phase === 'KO_OPEN'

  return {
    groupLocked,
    knockoutLocked,
    picksHidden,
    rivalsComparisonVisible: !picksHidden,
    exportsVisible,
    groupEditable,
    matchPicksEditable,
    bracketEditable
  }
}

export function computeTournamentPhase(inputs: ComputeTournamentPhaseInputs): TournamentPhaseState {
  const nowMs = parseUtcMs(inputs.nowUtc) ?? Date.now()
  const groupStageDeadlineMs = parseUtcMs(inputs.deadlines.groupStageDeadlineUtc)
  const firstKoKickoffMs = parseUtcMs(inputs.deadlines.firstKoKickoffUtc ?? null)

  const phaseFromHighestPrioritySource: TournamentPhase | null = isValidPhase(inputs.demoOverride)
    ? inputs.demoOverride
    : isValidPhase(inputs.selectedDemoPhase)
      ? inputs.selectedDemoPhase
      : resolvePhaseFromSnapshot(inputs.snapshotFields)

  let tournamentPhase =
    phaseFromHighestPrioritySource ??
    resolveDeadlineFallbackPhase({
      nowMs,
      groupStageDeadlineMs,
      firstKoKickoffMs,
      koDrawConfirmedSignal: inputs.koDrawConfirmedSignal,
      mode: inputs.mode
    })

  if (tournamentPhase !== 'FINAL' && inputs.mode === 'prod') {
    if (firstKoKickoffMs !== null && nowMs >= firstKoKickoffMs) {
      tournamentPhase = 'KO_LOCKED'
    } else if (tournamentPhase === 'KO_OPEN' && firstKoKickoffMs === null) {
      tournamentPhase = 'KO_LOCKED'
    }
  }

  return {
    tournamentPhase,
    lockFlags: resolveLockFlags(tournamentPhase),
    computedAt: new Date().toISOString()
  }
}

function isOpeningKoFixture(match: Match): boolean {
  const fixture = match as unknown as Record<string, unknown>
  const stage = typeof fixture.stage === 'string' ? fixture.stage : null
  const round = typeof fixture.round === 'string' ? fixture.round : null
  const knockoutRoundIndex =
    typeof fixture.knockoutRoundIndex === 'number' ? fixture.knockoutRoundIndex : null

  if (stage === 'KO' && round === 'R32') return true
  if (knockoutRoundIndex === 0) return true
  return stage === 'R32'
}

function hasNonEmptyTeam(match: Match, side: 'home' | 'away'): boolean {
  const fixture = match as unknown as Record<string, unknown>
  const key = side === 'home' ? 'homeTeamId' : 'awayTeamId'
  if (typeof fixture[key] === 'string' && fixture[key].trim()) return true
  const code = side === 'home' ? match.homeTeam?.code : match.awayTeam?.code
  return Boolean(code?.trim())
}

export function computeKoDrawConfirmedSignal(matches: Match[]): boolean {
  const openingRound = matches.filter((match) => isOpeningKoFixture(match))
  if (openingRound.length < 16) return false

  return openingRound.every((match) => {
    const kickoffMs = parseUtcMs(match.kickoffUtc)
    return kickoffMs !== null && hasNonEmptyTeam(match, 'home') && hasNonEmptyTeam(match, 'away')
  })
}
