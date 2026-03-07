import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PAGE_FILES = [
  'LandingPage.tsx',
  'GroupStagePage.tsx',
  'PicksPage.tsx',
  'BracketPage.tsx',
  'LeaderboardPage.tsx',
  'AdminUsersPage.tsx',
  'AdminExportsPage.tsx',
  'DemoControlsPage.tsx'
] as const

for (const pageFile of PAGE_FILES) {
  test(`page shell smoke: ${pageFile} has a valid default export`, async () => {
    const absolutePath = path.join(process.cwd(), 'src', 'ui', 'pages', pageFile)
    const source = await readFile(absolutePath, 'utf8')

    const hasFunctionDefaultExport = /export\s+default\s+function\s+\w+/.test(source)
    const hasReexportDefault = /export\s+\{\s*default\s*\}\s+from\s+['"][^'"]+['"]/.test(source)

    assert.equal(hasFunctionDefaultExport || hasReexportDefault, true)
  })
}
