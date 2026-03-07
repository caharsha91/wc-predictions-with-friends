import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const APP_PATH = path.join(process.cwd(), 'src', 'ui', 'App.tsx')

test('companion route smoke: app includes /m route namespace', async () => {
  const source = await readFile(APP_PATH, 'utf8')

  assert.equal(
    source.includes('<Route path="/m" element={<CompanionSurfaceGate />}>'),
    true,
    'App should define /m namespace behind companion surface gate'
  )

  assert.equal(
    source.includes('<Route path="predictions" element={<CompanionPredictionsPage />} />'),
    true,
    'Companion route should include predictions screen'
  )

  assert.equal(
    source.includes('<Route path="admin/*" element={<Navigate to="/m" replace />} />'),
    true,
    'Companion route should redirect admin paths away from companion surface'
  )

  assert.equal(
    source.includes('<Route path="demo/*" element={<Navigate to="/m" replace />} />'),
    true,
    'Companion route should redirect demo paths away from companion surface'
  )

  assert.equal(
    source.includes('<Route path="matches" element={<Navigate to="/m" replace />} />'),
    true,
    'Companion should deprecate /m/matches to /m'
  )

  assert.equal(
    source.includes('<Route path="profile" element={<Navigate to="/m" replace />} />'),
    true,
    'Companion should deprecate /m/profile to /m'
  )
})
