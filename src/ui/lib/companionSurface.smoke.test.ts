import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANION_ROUTE_CAPABILITIES,
  isCompanionDeniedPath,
  isCompanionPath,
  resolveCompanionArea,
  resolveCompanionFallbackPath
} from './companionSurface'

test('companion capabilities expose only companion-safe routes', () => {
  assert.deepEqual(Object.keys(COMPANION_ROUTE_CAPABILITIES).sort(), [
    '/m',
    '/m/leaderboard',
    '/m/matches',
    '/m/predictions',
    '/m/profile'
  ])
})

test('companion path helpers classify routes correctly', () => {
  assert.equal(isCompanionPath('/m'), true)
  assert.equal(isCompanionPath('/m/predictions'), true)
  assert.equal(isCompanionPath('/leaderboard'), false)

  assert.equal(resolveCompanionArea('/m'), 'home')
  assert.equal(resolveCompanionArea('/m/leaderboard'), 'leaderboard')
  assert.equal(resolveCompanionArea('/m/unknown'), null)
})

test('companion denied-route helpers resolve expected fallback targets', () => {
  assert.equal(isCompanionDeniedPath('/m/admin/players'), true)
  assert.equal(isCompanionDeniedPath('/m/demo/admin/controls'), true)
  assert.equal(isCompanionDeniedPath('/m/group-stage/A'), true)
  assert.equal(isCompanionDeniedPath('/m/knockout-bracket'), true)
  assert.equal(isCompanionDeniedPath('/m/predictions'), false)

  assert.equal(resolveCompanionFallbackPath('/m/admin/players'), '/m/profile')
  assert.equal(resolveCompanionFallbackPath('/m/demo/leaderboard'), '/m/profile')
  assert.equal(resolveCompanionFallbackPath('/m/group-stage/A'), '/m/predictions')
  assert.equal(resolveCompanionFallbackPath('/m/match-picks'), '/m/predictions')
})
