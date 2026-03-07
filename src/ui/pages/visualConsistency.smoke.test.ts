import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const PAGE_EXPECTATIONS = [
  { file: 'LandingPageContent.tsx', snapshotStampCount: 1, metadataItemsCount: 1 },
  { file: 'GroupStagePage.tsx', snapshotStampCount: 1, metadataItemsCount: 1 },
  { file: 'PicksPage.tsx', snapshotStampCount: 1, metadataItemsCount: 1 },
  { file: 'LeaderboardPage.tsx', snapshotStampCount: 1, metadataItemsCount: 1 },
  { file: 'BracketPageContent.tsx', snapshotStampCount: 2, metadataItemsCount: 2 }
] as const

for (const expectation of PAGE_EXPECTATIONS) {
  test(`visual consistency smoke: ${expectation.file} keeps single header metadata source`, async () => {
    const absolutePath = path.join(process.cwd(), 'src', 'ui', 'pages', expectation.file)
    const source = await readFile(absolutePath, 'utf8')

    const snapshotStampCount = [...source.matchAll(/<SnapshotStamp\b/g)].length
    const metadataItemsCount = [...source.matchAll(/metadataItems=\{/g)].length

    assert.equal(
      snapshotStampCount,
      expectation.snapshotStampCount,
      `${expectation.file} should only render header snapshot stamps for each scenario branch`
    )
    assert.equal(
      metadataItemsCount,
      expectation.metadataItemsCount,
      `${expectation.file} should use metadataItems as the single header metadata source`
    )
    assert.equal(
      source.includes('prefix="Latest snapshot: "'),
      false,
      `${expectation.file} should consume shared snapshot prefix copy`
    )
  })
}
