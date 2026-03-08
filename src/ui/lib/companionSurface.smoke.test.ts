import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMPANION_ROUTE_CAPABILITIES,
  isAdminOrDemoPath,
  isCompanionDeniedPath,
  isCompanionPath,
  resolveCompanionArea,
  resolveCompanionFallbackPath,
  resolveCompanionSafePath
} from './companionSurface'

test('companion capabilities expose only companion-safe routes', () => {
  assert.deepEqual(Object.keys(COMPANION_ROUTE_CAPABILITIES).sort(), [
    '/m',
    '/m/leaderboard',
    '/m/picks'
  ])
})

test('companion path helpers classify routes correctly', () => {
  assert.equal(isCompanionPath('/m'), true)
  assert.equal(isCompanionPath('/m/picks'), true)
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
  assert.equal(isCompanionDeniedPath('/m/matches'), true)
  assert.equal(isCompanionDeniedPath('/m/profile'), true)
  assert.equal(isCompanionDeniedPath('/m/predictions'), true)
  assert.equal(isCompanionDeniedPath('/m/picks'), false)

  assert.equal(resolveCompanionFallbackPath('/m/admin/players'), '/m')
  assert.equal(resolveCompanionFallbackPath('/m/demo/leaderboard'), '/m')
  assert.equal(resolveCompanionFallbackPath('/m/matches'), '/m')
  assert.equal(resolveCompanionFallbackPath('/m/profile'), '/m')
  assert.equal(resolveCompanionFallbackPath('/m/group-stage/A'), '/m')
  assert.equal(resolveCompanionFallbackPath('/m/match-picks'), '/m/picks')
  assert.equal(resolveCompanionFallbackPath('/m/predictions'), '/m')
})

test('companion-safe path resolver prevents admin/demo leakage', () => {
  assert.equal(isAdminOrDemoPath('/admin/users'), true)
  assert.equal(isAdminOrDemoPath('/demo/controls'), true)
  assert.equal(isAdminOrDemoPath('/leaderboard'), false)

  assert.equal(resolveCompanionSafePath('/admin/users'), '/m')
  assert.equal(resolveCompanionSafePath('/demo/controls?tab=flags'), '/m')
  assert.equal(resolveCompanionSafePath('/m/admin/tools'), '/m')
  assert.equal(resolveCompanionSafePath('/m/group-stage/A'), '/m')
  assert.equal(resolveCompanionSafePath('/leaderboard?view=compact#rivals'), '/m')
  assert.equal(resolveCompanionSafePath('/m/predictions'), '/m')
  assert.equal(resolveCompanionSafePath('/m/picks'), '/m/picks')
})
