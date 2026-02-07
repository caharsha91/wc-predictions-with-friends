export type NextActionKind =
  | 'OPEN_PICKS'
  | 'OPEN_BRACKET'
  | 'VIEW_RESULTS'
  | 'LOCKED_WAITING'
  | 'IDLE'

export type NextActionStatusChipType = 'deadline' | 'unlock' | 'lastSubmitted'

export type NextActionStatusChip = {
  type: NextActionStatusChipType
  label: string
  atUtc?: string
}

export type NextActionCandidate = {
  id: string
  label: string
  deadlineUtc?: string
  kickoffUtc?: string
  stageOrder?: number
}

export type NextActionInput = {
  openPickCandidates: NextActionCandidate[]
  openBracketCandidates: NextActionCandidate[]
  latestResultsUpdatedUtc?: string
  seenResultsUpdatedUtc?: string
  lockedWaitingUnlockUtc?: string
  lockedWaitingDeadlineUtc?: string
  lastSubmittedUtc?: string
}

export type NextActionResult = {
  kind: NextActionKind
  targetId?: string
  label: string
  statusChip: NextActionStatusChip
  reason: string
}

export type PlayCenterState =
  | 'LOADING'
  | 'READY_OPEN_PICKS'
  | 'READY_OPEN_BRACKET'
  | 'READY_RESULTS'
  | 'READY_LOCKED_WAITING'
  | 'READY_IDLE'
  | 'ERROR'

export type PlayCenterEvent =
  | 'DATA_LOADED'
  | 'DATA_REFRESHED'
  | 'CLOCK_TICK'
  | 'PICK_SAVED'
  | 'BRACKET_SAVED'
  | 'LOCK_STATUS_CHANGED'
  | 'ROUTE_ENTERED'
  | 'DATA_FAILED'
  | 'RESET_LOADING'

function toMillis(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY
  const millis = new Date(value).getTime()
  return Number.isFinite(millis) ? millis : Number.POSITIVE_INFINITY
}

function toStageOrder(value?: number): number {
  return typeof value === 'number' ? value : Number.POSITIVE_INFINITY
}

function compareCandidates(a: NextActionCandidate, b: NextActionCandidate): number {
  const deadlineDiff = toMillis(a.deadlineUtc) - toMillis(b.deadlineUtc)
  if (deadlineDiff !== 0) return deadlineDiff

  const kickoffDiff = toMillis(a.kickoffUtc) - toMillis(b.kickoffUtc)
  if (kickoffDiff !== 0) return kickoffDiff

  const stageDiff = toStageOrder(a.stageOrder) - toStageOrder(b.stageOrder)
  if (stageDiff !== 0) return stageDiff

  return a.id.localeCompare(b.id)
}

function choosePriorityCandidate(candidates: NextActionCandidate[]): NextActionCandidate | null {
  if (candidates.length === 0) return null
  return [...candidates].sort(compareCandidates)[0]
}

function buildDeadlineChip(deadlineUtc: string | undefined, fallbackUtc?: string): NextActionStatusChip {
  if (deadlineUtc) {
    return { type: 'deadline', label: 'Deadline', atUtc: deadlineUtc }
  }
  if (fallbackUtc) {
    return { type: 'lastSubmitted', label: 'Last submitted', atUtc: fallbackUtc }
  }
  return { type: 'lastSubmitted', label: 'Last submitted' }
}

function isResultsUnseen(latestResultsUpdatedUtc?: string, seenResultsUpdatedUtc?: string): boolean {
  if (!latestResultsUpdatedUtc) return false
  if (!seenResultsUpdatedUtc) return true
  return new Date(seenResultsUpdatedUtc).getTime() < new Date(latestResultsUpdatedUtc).getTime()
}

export function resolveNextAction(input: NextActionInput): NextActionResult {
  const nextOpenPick = choosePriorityCandidate(input.openPickCandidates)
  if (nextOpenPick) {
    return {
      kind: 'OPEN_PICKS',
      targetId: nextOpenPick.id,
      label: nextOpenPick.label,
      statusChip: buildDeadlineChip(nextOpenPick.deadlineUtc, input.lastSubmittedUtc),
      reason: 'Open picks are highest priority.'
    }
  }

  const nextOpenBracket = choosePriorityCandidate(input.openBracketCandidates)
  if (nextOpenBracket) {
    return {
      kind: 'OPEN_BRACKET',
      targetId: nextOpenBracket.id,
      label: nextOpenBracket.label,
      statusChip: buildDeadlineChip(nextOpenBracket.deadlineUtc, input.lastSubmittedUtc),
      reason: 'No open picks remain; bracket picks are next priority.'
    }
  }

  if (isResultsUnseen(input.latestResultsUpdatedUtc, input.seenResultsUpdatedUtc)) {
    return {
      kind: 'VIEW_RESULTS',
      label: 'Check latest results',
      statusChip: {
        type: 'lastSubmitted',
        label: 'Last updated',
        atUtc: input.latestResultsUpdatedUtc
      },
      reason: 'No pick actions remain and latest results are unseen in this session.'
    }
  }

  if (input.lockedWaitingUnlockUtc || input.lockedWaitingDeadlineUtc) {
    if (input.lockedWaitingUnlockUtc) {
      return {
        kind: 'LOCKED_WAITING',
        label: 'Waiting for next unlock',
        statusChip: {
          type: 'unlock',
          label: 'Unlock',
          atUtc: input.lockedWaitingUnlockUtc
        },
        reason: 'All current actions are locked.'
      }
    }

    return {
      kind: 'LOCKED_WAITING',
      label: 'Waiting for next lock cycle',
      statusChip: {
        type: 'deadline',
        label: 'Deadline',
        atUtc: input.lockedWaitingDeadlineUtc
      },
      reason: 'No open actions remain; next relevant event is upcoming.'
    }
  }

  if (input.lastSubmittedUtc) {
    return {
      kind: 'IDLE',
      label: 'All caught up',
      statusChip: { type: 'lastSubmitted', label: 'Last submitted', atUtc: input.lastSubmittedUtc },
      reason: 'No immediate actions or pending updates.'
    }
  }

  return {
    kind: 'IDLE',
    label: 'Nothing actionable right now',
    statusChip: { type: 'lastSubmitted', label: 'Last submitted' },
    reason: 'No actionable items detected.'
  }
}

export function getPlayCenterStateFromAction(kind: NextActionKind): PlayCenterState {
  switch (kind) {
    case 'OPEN_PICKS':
      return 'READY_OPEN_PICKS'
    case 'OPEN_BRACKET':
      return 'READY_OPEN_BRACKET'
    case 'VIEW_RESULTS':
      return 'READY_RESULTS'
    case 'LOCKED_WAITING':
      return 'READY_LOCKED_WAITING'
    case 'IDLE':
    default:
      return 'READY_IDLE'
  }
}

export function reducePlayCenterState(
  current: PlayCenterState,
  event: PlayCenterEvent,
  input: NextActionInput
): PlayCenterState {
  if (event === 'RESET_LOADING') return 'LOADING'
  if (event === 'DATA_FAILED') return 'ERROR'
  if (current === 'ERROR') return 'ERROR'

  const nextAction = resolveNextAction(input)
  return getPlayCenterStateFromAction(nextAction.kind)
}
