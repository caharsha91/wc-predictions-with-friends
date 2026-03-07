import test from 'node:test'
import assert from 'node:assert/strict'

import { rankRowsWithTiePriority } from './leaderboardTieRanking'

type Row = {
  id: string
  name: string
  points: number
}

test('rankRowsWithTiePriority assigns shared ranks for ties', () => {
  const rows: Row[] = [
    { id: 'a', name: 'Alice', points: 12 },
    { id: 'b', name: 'Bob', points: 12 },
    { id: 'c', name: 'Carla', points: 9 }
  ]

  const ranked = rankRowsWithTiePriority({
    rows,
    getPoints: (row) => row.points,
    getIdentityKeys: (row) => [row.id],
    getName: (row) => row.name
  })

  assert.equal(ranked.rankedRows[0]?.rank, 1)
  assert.equal(ranked.rankedRows[1]?.rank, 1)
  assert.equal(ranked.rankedRows[2]?.rank, 3)
})

test('rankRowsWithTiePriority keeps viewer/rivals first inside same-point tie', () => {
  const rows: Row[] = [
    { id: 'neutral', name: 'Neutral', points: 10 },
    { id: 'rival', name: 'Rival', points: 10 },
    { id: 'viewer', name: 'Viewer', points: 10 }
  ]

  const ranked = rankRowsWithTiePriority({
    rows,
    getPoints: (row) => row.points,
    getIdentityKeys: (row) => [row.id],
    getName: (row) => row.name,
    viewerIdentity: 'viewer',
    rivalIdentities: ['rival']
  })

  const orderedIds = ranked.rankedRows.map((entry) => entry.row.id)
  assert.deepEqual(orderedIds.slice(0, 2), ['viewer', 'rival'])
  assert.equal(ranked.rankByIdentity.get('viewer'), 1)
  assert.equal(ranked.rankByIdentity.get('rival'), 1)
})
