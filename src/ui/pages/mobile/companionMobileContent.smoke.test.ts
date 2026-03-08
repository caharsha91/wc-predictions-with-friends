import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const MOBILE_PAGES_PATH = path.join(process.cwd(), 'src', 'ui', 'pages', 'mobile')

test('companion home includes profile editors and status-only Group Stage/Knockout cards', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionPages.tsx'), 'utf8')

  assert.equal(source.includes('Favorite team'), true)
  assert.equal(source.includes('Rivals'), true)
  assert.equal(source.includes('FavoriteTeamSheet'), true)
  assert.equal(source.includes('ManageRivalsSheet'), true)
  assert.equal(source.includes('writeUserProfile('), true)
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

test('companion league content uses one unified leaderboard list', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionLeaderboardContent.tsx'), 'utf8')

  assert.equal(source.includes('Updated'), true)
  assert.equal(source.includes('<FeedHeading label="Leaderboard"'), true)
  assert.equal(source.includes('Top ${TOP_LEADERBOARD_LIMIT} + You + Rivals'), true)
  assert.equal(source.includes('TOP_LEADERBOARD_LIMIT = 10'), true)
  assert.equal(source.includes('showBreakdown={row.isViewer || row.rivalSlot !== null}'), true)
  assert.equal(source.includes('Ex {entry.exactPoints}'), true)
  assert.equal(source.includes('writeUserProfile('), false)
  assert.equal(source.includes('addRival('), false)
  assert.equal(source.includes('removeRival('), false)
  assert.equal(source.includes('reorderRival'), false)
})

test('companion mobile auth pages keep direct sign-in and account switch actions', async () => {
  const source = await readFile(path.join(MOBILE_PAGES_PATH, 'CompanionAuthPages.tsx'), 'utf8')

  assert.equal(source.includes('Continue with Google'), true)
  assert.equal(source.includes('Switch Google account'), true)
  assert.equal(source.includes('useToast'), true)
})

test('companion shell exposes mobile logout control in layout', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src', 'ui', 'components', 'mobile', 'MobileCompanionLayout.tsx'),
    'utf8'
  )

  assert.equal(source.includes("label: 'You'"), true)
  assert.equal(source.includes('grid-cols-4'), true)
  assert.equal(source.includes('setLogoutDialogOpen(true)'), true)
  assert.equal(source.includes('Log out'), true)
  assert.equal(source.includes('handleConfirmLogout'), true)
})
