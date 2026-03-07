import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveBestThirdStatus } from './groupStageSnapshot'

test('resolveBestThirdStatus leaves unselected rows neutral when final', () => {
  const status = resolveBestThirdStatus(true, true, true, undefined, new Set(['AAA']))
  assert.equal(status, 'pending')
})

test('resolveBestThirdStatus marks selected qualifier as qualified when final', () => {
  const status = resolveBestThirdStatus(true, true, true, 'AAA', new Set(['AAA', 'BBB']))
  assert.equal(status, 'qualified')
})

test('resolveBestThirdStatus marks selected team as missed when not in final qualifiers', () => {
  const status = resolveBestThirdStatus(true, true, true, 'CCC', new Set(['AAA', 'BBB']))
  assert.equal(status, 'missed')
})
