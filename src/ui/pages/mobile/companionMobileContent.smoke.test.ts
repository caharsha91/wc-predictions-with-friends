import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const MOBILE_PAGES_PATH = path.join(process.cwd(), 'src', 'ui', 'pages', 'mobile')

test('companion home includes status-only Group Stage and Knockout Bracket cards', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionPages.tsx'), 'utf8')

  assert.equal(source.includes('Group Stage'), true)
  assert.equal(source.includes('Knockout Bracket'), true)
  assert.equal(source.includes('Group stage actions are available on web.'), true)
  assert.equal(source.includes('Knockout bracket actions are available on web.'), true)
})

test('companion picks content is match-picks only', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionPredictionsContent.tsx'), 'utf8')

  assert.equal(source.includes('Match Picks'), true)
  assert.equal(source.includes('useBracketKnockoutData'), false)
  assert.equal(source.includes('useGroupStageData'), false)
  assert.equal(source.includes('Knockout bracket actions are available on web.'), false)
  assert.equal(source.includes('Group stage actions are available on web.'), false)
})

test('companion league content is read-only rivals standings with breakdown chips', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionLeaderboardContent.tsx'), 'utf8')

  assert.equal(source.includes('<div className="v2-type-kicker">You</div>'), true)
  assert.equal(source.includes('<div className="v2-type-kicker">Rivals</div>'), true)
  assert.equal(source.includes('<div className="v2-type-kicker">Leaderboard</div>'), true)
  assert.equal(source.includes('Exact {entry.exactPoints}'), true)
  assert.equal(source.includes('Outcome {entry.resultPoints}'), true)
  assert.equal(source.includes('KO {entry.knockoutPoints}'), true)
  assert.equal(source.includes('Bracket {entry.bracketPoints}'), true)
  assert.equal(source.includes('writeUserProfile('), false)
  assert.equal(source.includes('addRival('), false)
  assert.equal(source.includes('removeRival('), false)
  assert.equal(source.includes('reorderRival'), false)
})
