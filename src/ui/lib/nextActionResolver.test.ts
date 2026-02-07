import { describe, expect, it } from 'vitest'

import {
  reducePlayCenterState,
  resolveNextAction,
  type NextActionInput
} from './nextActionResolver'

function makeInput(overrides: Partial<NextActionInput> = {}): NextActionInput {
  return {
    openPickCandidates: [],
    openBracketCandidates: [],
    latestResultsUpdatedUtc: undefined,
    seenResultsUpdatedUtc: undefined,
    lockedWaitingUnlockUtc: undefined,
    lockedWaitingDeadlineUtc: undefined,
    lastSubmittedUtc: undefined,
    ...overrides
  }
}

describe('resolveNextAction', () => {
  it('prioritizes open picks over all other actions', () => {
    const result = resolveNextAction(
      makeInput({
        openPickCandidates: [
          {
            id: 'm-2',
            label: 'Match 2',
            deadlineUtc: '2026-06-11T01:00:00.000Z',
            kickoffUtc: '2026-06-11T01:30:00.000Z',
            stageOrder: 0
          }
        ],
        openBracketCandidates: [
          {
            id: 'b-1',
            label: 'Bracket 1',
            deadlineUtc: '2026-06-10T23:00:00.000Z'
          }
        ],
        latestResultsUpdatedUtc: '2026-06-10T20:00:00.000Z',
        seenResultsUpdatedUtc: '2026-06-10T19:00:00.000Z',
        lockedWaitingUnlockUtc: '2026-06-12T10:00:00.000Z'
      })
    )

    expect(result.kind).toBe('OPEN_PICKS')
    expect(result.targetId).toBe('m-2')
  })

  it('uses deterministic tie-breakers for open picks', () => {
    const result = resolveNextAction(
      makeInput({
        openPickCandidates: [
          {
            id: 'm-2',
            label: 'Later stage',
            deadlineUtc: '2026-06-11T01:00:00.000Z',
            kickoffUtc: '2026-06-11T02:00:00.000Z',
            stageOrder: 2
          },
          {
            id: 'm-1',
            label: 'Earlier kickoff',
            deadlineUtc: '2026-06-11T01:00:00.000Z',
            kickoffUtc: '2026-06-11T01:30:00.000Z',
            stageOrder: 3
          }
        ]
      })
    )

    expect(result.kind).toBe('OPEN_PICKS')
    expect(result.targetId).toBe('m-1')
  })

  it('uses open bracket when open picks are empty', () => {
    const result = resolveNextAction(
      makeInput({
        openBracketCandidates: [
          {
            id: 'b-1',
            label: 'Quarterfinal 1',
            deadlineUtc: '2026-07-01T12:00:00.000Z'
          }
        ]
      })
    )

    expect(result.kind).toBe('OPEN_BRACKET')
    expect(result.targetId).toBe('b-1')
  })

  it('falls back to unseen results when no picks are open', () => {
    const result = resolveNextAction(
      makeInput({
        latestResultsUpdatedUtc: '2026-06-10T20:00:00.000Z',
        seenResultsUpdatedUtc: '2026-06-10T18:00:00.000Z'
      })
    )

    expect(result.kind).toBe('VIEW_RESULTS')
    expect(result.statusChip.label).toBe('Last updated')
  })

  it('returns locked waiting when everything is blocked', () => {
    const result = resolveNextAction(
      makeInput({
        lockedWaitingUnlockUtc: '2026-06-12T00:00:00.000Z'
      })
    )

    expect(result.kind).toBe('LOCKED_WAITING')
    expect(result.statusChip.type).toBe('unlock')
  })
})

describe('reducePlayCenterState', () => {
  it('transitions to error on DATA_FAILED', () => {
    const state = reducePlayCenterState('LOADING', 'DATA_FAILED', makeInput())
    expect(state).toBe('ERROR')
  })

  it('derives READY_OPEN_PICKS from resolver output', () => {
    const state = reducePlayCenterState(
      'LOADING',
      'DATA_LOADED',
      makeInput({
        openPickCandidates: [
          {
            id: 'm-1',
            label: 'Match 1',
            deadlineUtc: '2026-06-10T20:00:00.000Z'
          }
        ]
      })
    )

    expect(state).toBe('READY_OPEN_PICKS')
  })
})
