import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const LAYOUT_PATH = path.join(process.cwd(), 'src', 'ui', 'Layout.tsx')

test('layout mobile redirect smoke: explicit web routes set session opt-out', async () => {
  const source = await readFile(LAYOUT_PATH, 'utf8')

  assert.equal(
    source.includes('markMobileRootRedirectOptOut()'),
    true,
    'Layout should mark root mobile redirect opt-out after explicit web-route usage'
  )

  assert.equal(
    source.includes("if (location.pathname === '/' || location.pathname === '/demo') return"),
    true,
    'Layout should not mark opt-out from root-like routes'
  )

  assert.equal(
    source.includes('if (!appContentRoute) return'),
    true,
    'Layout should only mark opt-out for explicit app content routes'
  )
})
