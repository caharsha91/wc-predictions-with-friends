import { describe, expect, it } from 'vitest'

import { getPickOutcome, getPredictedWinner, isPickComplete, upsertPick } from './picks'
import type { Match } from '../types/matches'
import type { Pick } from '../types/picks'

function buildMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'match-1',
    stage: 'Group',
    kickoffUtc: '2026-06-11T19:00:00Z',
    status: 'SCHEDULED',
    homeTeam: { code: 'USA', name: 'United States' },
    awayTeam: { code: 'MEX', name: 'Mexico' },
    ...overrides
  }
}

function buildPick(overrides: Partial<Pick> = {}): Pick {
  return {
    id: 'pick-user-1-match-1',
    matchId: 'match-1',
    userId: 'user-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides
  }
}

describe('picks auto derivation', () => {
  it('derives outcome from score input during upsert', () => {
    const picks = upsertPick([], {
      matchId: 'match-1',
      userId: 'user-1',
      homeScore: 2,
      awayScore: 1
    })
    expect(picks).toHaveLength(1)
    expect(picks[0].outcome).toBe('WIN')
    expect(getPickOutcome(picks[0])).toBe('WIN')
  })

  it('requires advances for knockout draw picks', () => {
    const knockoutMatch = buildMatch({ stage: 'R16' })
    const drawPick = buildPick({ homeScore: 1, awayScore: 1 })
    const withAdvances = buildPick({ homeScore: 1, awayScore: 1, advances: 'AWAY' })

    expect(isPickComplete(knockoutMatch, drawPick)).toBe(false)
    expect(isPickComplete(knockoutMatch, withAdvances)).toBe(true)
    expect(getPredictedWinner(withAdvances)).toBe('AWAY')
  })
})

