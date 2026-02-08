import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'

const fixtures = vi.hoisted(() => {
  const matches: Match[] = [
    {
      id: 'm-open',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-15T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'BRA', name: 'Brazil' },
      awayTeam: { code: 'NED', name: 'Netherlands' }
    },
    {
      id: 'm-finished',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-10T18:00:00.000Z',
      status: 'FINISHED',
      homeTeam: { code: 'ESP', name: 'Spain' },
      awayTeam: { code: 'GER', name: 'Germany' },
      score: { home: 2, away: 1 },
      winner: 'HOME',
      decidedBy: 'REG'
    }
  ]

  const picks: Pick[] = [
    {
      id: 'pick-open',
      matchId: 'm-open',
      userId: 'user-1',
      homeScore: 1,
      awayScore: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    },
    {
      id: 'pick-finished',
      matchId: 'm-finished',
      userId: 'user-1',
      homeScore: 2,
      awayScore: 1,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    }
  ]

  const scoring = {
    group: { exactScoreBoth: 3, exactScoreOne: 1, result: 2 },
    knockout: {
      R32: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 1 },
      R16: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 1 },
      QF: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 1 },
      SF: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 1 },
      Third: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 1 },
      Final: { exactScoreBoth: 3, exactScoreOne: 1, result: 2, knockoutWinner: 3 }
    },
    bracket: {
      groupQualifiers: 8,
      thirdPlaceQualifiers: 4,
      knockout: {
        R32: 2,
        R16: 3,
        QF: 4,
        SF: 5,
        Third: 2,
        Final: 8
      }
    }
  }

  return { matches, picks, scoring }
})

vi.mock('../../lib/data', () => ({
  fetchScoring: vi.fn(async () => fixtures.scoring)
}))

vi.mock('../hooks/useNow', () => ({
  useNow: () => new Date('2026-06-12T12:00:00.000Z')
}))

vi.mock('../hooks/useViewerId', () => ({
  useViewerId: () => 'user-1'
}))

vi.mock('../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false
}))

vi.mock('../hooks/usePicksData', () => ({
  usePicksData: () => ({
    state: {
      status: 'ready',
      matches: fixtures.matches,
      lastUpdated: '2026-06-12T12:00:00.000Z'
    },
    picks: fixtures.picks,
    updatePicks: vi.fn(),
    savePicks: vi.fn(async () => {}),
    saveStatus: 'idle',
    canSave: false
  })
}))

vi.mock('../hooks/useBracketKnockoutData', () => ({
  useBracketKnockoutData: () => ({
    loadState: { status: 'ready', byStage: {} },
    knockout: {},
    stageOrder: []
  })
}))

vi.mock('../hooks/useGroupOutcomesData', () => ({
  useGroupOutcomesData: () => ({
    loadState: { status: 'ready' },
    data: { groups: {}, bestThirds: [], updatedAt: '2026-06-12T12:00:00.000Z' },
    groupIds: []
  })
}))

import PicksPage from './PicksPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/play/picks" element={<PicksPage />} />
        <Route path="/play" element={<div>Play Center Route</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PicksPage inline finished matches', () => {
  it('renders read-only detail shell with header picks link and embedded lists', () => {
    renderAt('/play/picks')

    expect(screen.queryByText('Next lock')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to picks/i })).toBeInTheDocument()
    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByText('Finished matches')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /wizard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Points' })).not.toBeInTheDocument()
    expect(screen.queryByText(/open picks need submission/i)).not.toBeInTheDocument()
  })

  it('treats view query as normal picks page (no special mode)', () => {
    renderAt('/play/picks?view=results')

    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByText('Finished matches')).toBeInTheDocument()
  })

  it('expands finished category and renders compact results rows with points', async () => {
    renderAt('/play/picks')

    fireEvent.click(screen.getByRole('button', { name: /finished matches/i }))

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Points' })).toBeInTheDocument()
    })
    expect(screen.getByText('ESP vs GER')).toBeInTheDocument()
    expect(screen.getByText('+5')).toBeInTheDocument()
  })

  it('marks results as seen when finished category is opened', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderAt('/play/picks')

    fireEvent.click(screen.getByRole('button', { name: /finished matches/i }))

    await waitFor(() => {
      expect(window.sessionStorage.getItem('wc-results-seen:user-1')).toBe('2026-06-12T12:00:00.000Z')
    })
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event))
    dispatchSpy.mockRestore()
  })

  it('keeps a header picks link available', () => {
    renderAt('/play/picks')

    const picksLink = screen.getByRole('link', { name: /back to picks/i })
    expect(picksLink).toHaveAttribute('href', '/play/picks')
  })

  it('renders classic page-number controls for finished matches', async () => {
    const originalMatches = fixtures.matches
    const originalPicks = fixtures.picks
    fixtures.matches = Array.from({ length: 12 }, (_, index) => ({
      id: `m-finished-${index}`,
      stage: 'Group',
      group: 'A',
      kickoffUtc: `2026-06-${String(10 + index).padStart(2, '0')}T18:00:00.000Z`,
      status: 'FINISHED',
      homeTeam: { code: `H${index}`, name: `Home ${index}` },
      awayTeam: { code: `A${index}`, name: `Away ${index}` },
      score: { home: 1, away: 0 },
      winner: 'HOME',
      decidedBy: 'REG'
    }))
    fixtures.picks = fixtures.matches.map((match) => ({
      id: `pick-${match.id}`,
      matchId: match.id,
      userId: 'user-1',
      homeScore: 1,
      awayScore: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    }))

    renderAt('/play/picks')
    fireEvent.click(screen.getByRole('button', { name: /finished matches/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /finished page 2/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /finished page 2/i }))
    expect(screen.getByText(/showing 11-12 of 12/i)).toBeInTheDocument()

    fixtures.matches = originalMatches
    fixtures.picks = originalPicks
  })
})
