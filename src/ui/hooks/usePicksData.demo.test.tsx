import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  saveUserPicksDoc: vi.fn()
}))

vi.mock('../../lib/firebase', () => ({
  hasFirebase: true
}))

vi.mock('./useAuthState', () => ({
  useAuthState: () => ({ status: 'ready', user: { uid: 'user-1' } })
}))

vi.mock('./useCurrentUser', () => ({
  useCurrentUser: () => ({ id: 'user-1', isMember: false })
}))

vi.mock('./useViewerId', () => ({
  useViewerId: () => 'user-1'
}))

vi.mock('../../lib/data', () => ({
  fetchMatches: vi.fn().mockResolvedValue({
    lastUpdated: '2026-01-01T00:00:00.000Z',
    matches: []
  }),
  fetchPicks: vi.fn().mockResolvedValue({
    picks: []
  })
}))

vi.mock('../../lib/firestoreData', () => ({
  fetchUserPicksDoc: vi.fn().mockResolvedValue(null),
  saveUserPicksDoc: mocks.saveUserPicksDoc
}))

import { usePicksData } from './usePicksData'

function SaveHarness({ onDone }: { onDone: () => void }) {
  const { savePicks } = usePicksData()
  useEffect(() => {
    void savePicks([]).then(onDone)
  }, [onDone, savePicks])
  return null
}

describe('usePicksData write guard', () => {
  it('does not call Firebase writes when firestoreEnabled is false', async () => {
    const onDone = vi.fn()
    render(<SaveHarness onDone={onDone} />)

    await waitFor(() => {
      expect(onDone).toHaveBeenCalled()
    })
    expect(mocks.saveUserPicksDoc).not.toHaveBeenCalled()
  })
})
