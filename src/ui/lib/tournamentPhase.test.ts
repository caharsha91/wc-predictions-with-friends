import test from 'node:test'
import assert from 'node:assert/strict'

import type { Match } from '../../types/matches'
import { computeKoDrawConfirmedSignal, computeTournamentPhase } from './tournamentPhase'

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: overrides.id ?? 'm-1',
    stage: overrides.stage ?? 'R32',
    round: overrides.round,
    knockoutRoundIndex: overrides.knockoutRoundIndex,
    group: overrides.group,
    kickoffUtc: overrides.kickoffUtc ?? '2026-07-01T12:00:00.000Z',
    status: overrides.status ?? 'SCHEDULED',
    homeTeam: overrides.homeTeam ?? { code: 'AAA', name: 'Alpha' },
    awayTeam: overrides.awayTeam ?? { code: 'BBB', name: 'Bravo' },
    homeTeamId: overrides.homeTeamId,
    awayTeamId: overrides.awayTeamId,
    score: overrides.score,
    winner: overrides.winner,
    decidedBy: overrides.decidedBy
  }
}

test('computeTournamentPhase respects FINAL snapshot semantics', () => {
  const result = computeTournamentPhase({
    mode: 'prod',
    nowUtc: '2026-06-01T00:00:00.000Z',
    deadlines: {
      groupStageDeadlineUtc: '2026-06-10T00:00:00.000Z',
      firstKoKickoffUtc: '2026-06-15T00:00:00.000Z'
    },
    koDrawConfirmedSignal: true,
    snapshotFields: { snapshotFinalized: true },
    selectedDemoPhase: null,
    demoOverride: null
  })

  assert.equal(result.tournamentPhase, 'FINAL')
  assert.equal(result.lockFlags.matchPicksEditable, false)
  assert.equal(result.lockFlags.bracketEditable, false)
})

test('computeKoDrawConfirmedSignal supports legacy KO stage + round fallback', () => {
  const openingRound = Array.from({ length: 16 }, (_, index) =>
    createMatch({
      id: `legacy-ko-${index + 1}`,
      stage: 'R16',
      round: 'R32',
      kickoffUtc: `2026-07-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      homeTeamId: `home-${index + 1}`,
      awayTeamId: `away-${index + 1}`
    })
  )

  const asLegacy = openingRound.map((match) => ({ ...match, stage: 'KO' as unknown as Match['stage'] }))
  assert.equal(computeKoDrawConfirmedSignal(asLegacy), true)
})

test('computeKoDrawConfirmedSignal fails when opening round lacks resolved teams', () => {
  const incomplete = Array.from({ length: 16 }, (_, index) =>
    createMatch({
      id: `r32-${index + 1}`,
      stage: 'R32',
      homeTeamId: index === 0 ? '' : `home-${index + 1}`,
      awayTeamId: `away-${index + 1}`,
      homeTeam: index === 0 ? { code: 'TBD', name: 'TBD' } : { code: 'AAA', name: 'Alpha' }
    })
  )

  assert.equal(computeKoDrawConfirmedSignal(incomplete), false)
})
