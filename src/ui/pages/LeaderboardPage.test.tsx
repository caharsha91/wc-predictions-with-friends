import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { LeaderboardFile } from '../../types/leaderboard'
import type { Match } from '../../types/matches'
import type { PicksFile } from '../../types/picks'

const navigateMock = vi.fn()

const fixtures = vi.hoisted(() => {
  const leaderboard: LeaderboardFile = {
    lastUpdated: '2026-06-14T12:00:00.000Z',
    entries: [
      {
        member: { id: 'user-2', name: 'Demo Player 02', email: 'user-2@demo.local' },
        totalPoints: 168,
        exactPoints: 44,
        resultPoints: 71,
        knockoutPoints: 13,
        bracketPoints: 40,
        exactCount: 20,
        picksCount: 98
      },
      {
        member: { id: 'user-3', name: 'Demo Player 03', email: 'user-3@demo.local' },
        totalPoints: 162,
        exactPoints: 41,
        resultPoints: 67,
        knockoutPoints: 12,
        bracketPoints: 42,
        exactCount: 18,
        picksCount: 97
      },
      {
        member: { id: 'user-1', name: 'Demo Player 01', email: 'user-1@demo.local' },
        totalPoints: 160,
        exactPoints: 40,
        resultPoints: 64,
        knockoutPoints: 12,
        bracketPoints: 44,
        exactCount: 18,
        picksCount: 97
      },
      {
        member: { id: 'user-4', name: 'Demo Player 04', email: 'user-4@demo.local' },
        totalPoints: 159,
        exactPoints: 39,
        resultPoints: 65,
        knockoutPoints: 11,
        bracketPoints: 44,
        exactCount: 18,
        picksCount: 96
      }
    ]
  }

  const matches: Match[] = [
    {
      id: 'm-100',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-14T20:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'ARG', name: 'Argentina' },
      awayTeam: { code: 'NED', name: 'Netherlands' }
    },
    {
      id: 'm-101',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-14T23:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'BRA', name: 'Brazil' },
      awayTeam: { code: 'ENG', name: 'England' }
    },
    {
      id: 'm-102',
      stage: 'Group',
      group: 'B',
      kickoffUtc: '2026-06-13T20:00:00.000Z',
      status: 'FINISHED',
      homeTeam: { code: 'ESP', name: 'Spain' },
      awayTeam: { code: 'FRA', name: 'France' }
    }
  ]

  const picks: PicksFile = {
    picks: [
      {
        userId: 'user-1',
        updatedAt: '2026-06-14T11:40:00.000Z',
        picks: [
          {
            id: 'pick-1',
            matchId: 'm-100',
            userId: 'user-1',
            homeScore: 2,
            awayScore: 1,
            createdAt: '2026-06-14T11:40:00.000Z',
            updatedAt: '2026-06-14T11:40:00.000Z'
          },
          {
            id: 'pick-2',
            matchId: 'm-101',
            userId: 'user-1',
            homeScore: 1,
            awayScore: 1,
            advances: 'AWAY',
            createdAt: '2026-06-14T11:41:00.000Z',
            updatedAt: '2026-06-14T11:41:00.000Z'
          }
        ]
      },
      {
        userId: 'user-2',
        updatedAt: '2026-06-14T11:42:00.000Z',
        picks: [
          {
            id: 'pick-3',
            matchId: 'm-100',
            userId: 'user-2',
            homeScore: 1,
            awayScore: 2,
            createdAt: '2026-06-14T11:42:00.000Z',
            updatedAt: '2026-06-14T11:42:00.000Z'
          },
          {
            id: 'pick-4',
            matchId: 'm-101',
            userId: 'user-2',
            homeScore: 1,
            awayScore: 2,
            createdAt: '2026-06-14T11:42:00.000Z',
            updatedAt: '2026-06-14T11:42:00.000Z'
          }
        ]
      },
      {
        userId: 'user-3',
        updatedAt: '2026-06-14T11:45:00.000Z',
        picks: [
          {
            id: 'pick-5',
            matchId: 'm-100',
            userId: 'user-3',
            homeScore: 2,
            awayScore: 1,
            createdAt: '2026-06-14T11:45:00.000Z',
            updatedAt: '2026-06-14T11:45:00.000Z'
          },
          {
            id: 'pick-6',
            matchId: 'm-101',
            userId: 'user-3',
            homeScore: 2,
            awayScore: 0,
            createdAt: '2026-06-14T11:45:00.000Z',
            updatedAt: '2026-06-14T11:45:00.000Z'
          }
        ]
      }
    ]
  }

  return {
    leaderboard,
    matches,
    picks,
    now: new Date('2026-06-14T10:00:00.000Z')
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock
  }
})

vi.mock('../../lib/data', () => ({
  fetchLeaderboard: vi.fn(async () => fixtures.leaderboard),
  fetchMatches: vi.fn(async () => ({ lastUpdated: fixtures.leaderboard.lastUpdated, matches: fixtures.matches })),
  fetchPicks: vi.fn(async () => fixtures.picks)
}))

vi.mock('../hooks/useNow', () => ({
  useNow: () => fixtures.now
}))

vi.mock('../hooks/useRouteDataMode', () => ({
  useRouteDataMode: () => 'default'
}))

vi.mock('../hooks/useViewerId', () => ({
  useViewerId: () => 'user-1'
}))

vi.mock('../hooks/useAuthState', () => ({
  useAuthState: () => ({
    status: 'authenticated',
    user: { uid: 'user-1', email: 'user-1@demo.local' }
  })
}))

import LeaderboardPage from './LeaderboardPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/play/league']}>
      <LeaderboardPage />
    </MemoryRouter>
  )
}

describe('LeaderboardPage storytelling updates', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    window.localStorage.clear()
  })

  it('renders podium hero, momentum chevrons, and rivalry highlights', async () => {
    window.localStorage.setItem(
      'wc-leaderboard-rank-snapshot:default',
      JSON.stringify({
        lastUpdated: '2026-06-13T12:00:00.000Z',
        ranks: {
          'id:user-1': 4,
          'id:user-2': 2,
          'id:user-3': 1,
          'id:user-4': 3
        }
      })
    )

    renderPage()

    expect(await screen.findByText(/podium race/i)).toBeInTheDocument()
    expect(screen.getByText(/featured rival/i)).toBeInTheDocument()
    expect(screen.getByText(/closest above/i)).toBeInTheDocument()
    expect(screen.getByText(/closest below/i)).toBeInTheDocument()
    expect(screen.getAllByText(/^you$/i).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/↑|↓|—/)).length).toBeGreaterThan(0)
  })

  it('shows path-to-top-3 progress tracker and play-center CTA', async () => {
    renderPage()

    expect(await screen.findByText(/path to top 3/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open play center/i }))
    expect(navigateMock).toHaveBeenCalledWith('/play')
  })

  it('renders expandable what-to-pick-next hints and removes old top-card copy', async () => {
    renderPage()

    const summaryTitle = await screen.findByText(/what to pick next/i)
    const disclosure = summaryTitle.closest('details')
    expect(disclosure).not.toBeNull()
    expect(disclosure).not.toHaveAttribute('open')

    fireEvent.click(summaryTitle)

    expect(disclosure).toHaveAttribute('open')
    expect(screen.getByText(/arg vs ned/i)).toBeInTheDocument()
    expect(screen.getAllByText(/consensus:/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/league metrics/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/actionable insight/i)).not.toBeInTheDocument()
  })
})
