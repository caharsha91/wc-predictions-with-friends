import assert from 'node:assert/strict'
import test from 'node:test'

import type { RivalDirectoryEntry } from './profilePersistence'
import {
  buildRivalComparisonIdentities,
  buildRivalSlotLookup,
  resolveCanonicalRivalIds
} from './rivalIdentity'

const DIRECTORY: RivalDirectoryEntry[] = [
  { id: 'u_aswin', displayName: 'Aswin', email: 'aswin@example.com' },
  { id: 'u_ashok', displayName: 'Ashok', email: 'ashok@example.com' },
  { id: 'u_michael', displayName: 'Michael', email: 'michael@example.com' }
]

test('resolveCanonicalRivalIds canonicalizes using id/displayName/email identities', () => {
  const canonical = resolveCanonicalRivalIds(
    ['Aswin', 'ashok@example.com', 'u_michael'],
    'viewer',
    DIRECTORY
  )

  assert.deepEqual(canonical, ['u_aswin', 'u_ashok', 'u_michael'])
})

test('buildRivalComparisonIdentities expands canonical rivals with identity variants', () => {
  const identities = buildRivalComparisonIdentities(['u_aswin', 'u_ashok'], DIRECTORY).map((entry) => entry.toLowerCase())

  assert.equal(identities.includes('u_aswin'), true)
  assert.equal(identities.includes('aswin'), true)
  assert.equal(identities.includes('aswin@example.com'), true)
  assert.equal(identities.includes('u_ashok'), true)
  assert.equal(identities.includes('ashok'), true)
  assert.equal(identities.includes('ashok@example.com'), true)
})

test('buildRivalSlotLookup maps expanded identity keys to deterministic rival slots', () => {
  const slots = buildRivalSlotLookup(['u_aswin', 'u_ashok'], DIRECTORY)

  assert.equal(slots.get('u_aswin'), 1)
  assert.equal(slots.get('id:u_aswin'), 1)
  assert.equal(slots.get('name:aswin'), 1)
  assert.equal(slots.get('email:aswin@example.com'), 1)

  assert.equal(slots.get('u_ashok'), 2)
  assert.equal(slots.get('id:u_ashok'), 2)
  assert.equal(slots.get('name:ashok'), 2)
  assert.equal(slots.get('email:ashok@example.com'), 2)
})
