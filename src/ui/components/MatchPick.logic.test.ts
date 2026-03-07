import test from 'node:test'
import assert from 'node:assert/strict'

import { getWinnerId, isDraw } from '../lib/matchPickLogic'

test('isDraw returns true only for equal numeric scores', () => {
  assert.equal(isDraw(2, 2), true)
  assert.equal(isDraw(2, 1), false)
  assert.equal(isDraw(undefined, 1), false)
  assert.equal(isDraw(0, undefined), false)
})

test('getWinnerId resolves by score in regulation', () => {
  assert.equal(
    getWinnerId({
      isKnockout: false,
      teamAId: 'HOME',
      teamBId: 'AWAY',
      scoreA: 3,
      scoreB: 1
    }),
    'HOME'
  )
  assert.equal(
    getWinnerId({
      isKnockout: false,
      teamAId: 'HOME',
      teamBId: 'AWAY',
      scoreA: 1,
      scoreB: 2
    }),
    'AWAY'
  )
})

test('getWinnerId requires explicit winner on knockout draw', () => {
  assert.equal(
    getWinnerId({
      isKnockout: true,
      teamAId: 'HOME',
      teamBId: 'AWAY',
      scoreA: 1,
      scoreB: 1
    }),
    undefined
  )
  assert.equal(
    getWinnerId({
      isKnockout: true,
      teamAId: 'HOME',
      teamBId: 'AWAY',
      scoreA: 1,
      scoreB: 1,
      selectedWinnerId: 'HOME'
    }),
    'HOME'
  )
})
