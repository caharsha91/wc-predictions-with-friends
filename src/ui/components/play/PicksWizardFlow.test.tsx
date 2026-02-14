import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { Match } from '../../../types/matches'
import type { PicksFile } from '../../../types/picks'

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
    }
  ]

  const picksSnapshot: PicksFile = {
    picks: [
      {
        userId: 'user-2',
        updatedAt: '2026-06-12T11:59:00.000Z',
        picks: [
          {
            id: 'p-1',
            matchId: 'm-open',
            userId: 'user-2',
            homeScore: 2,
            awayScore: 0,
            createdAt: '2026-06-12T11:00:00.000Z',
            updatedAt: '2026-06-12T11:00:00.000Z'
          }
        ]
      },
      {
        userId: 'user-3',
        updatedAt: '2026-06-12T11:58:00.000Z',
        picks: [
          {
            id: 'p-2',
            matchId: 'm-open',
            userId: 'user-3',
            homeScore: 1,
            awayScore: 0,
            createdAt: '2026-06-12T11:00:00.000Z',
            updatedAt: '2026-06-12T11:00:00.000Z'
          }
        ]
      }
    ]
  }

  return { matches, picksSnapshot }
})

vi.mock('../../hooks/useNow', () => ({
  useNow: () => new Date('2026-06-12T12:00:00.000Z')
}))

vi.mock('../../hooks/useViewerId', () => ({
  useViewerId: () => 'user-1'
}))

vi.mock('../../hooks/usePicksData', () => ({
  usePicksData: () => ({
    state: {
      status: 'ready',
      matches: fixtures.matches,
      lastUpdated: '2026-06-12T12:00:00.000Z'
    },
    picks: [
      {
        id: 'self-pick',
        matchId: 'm-open',
        userId: 'user-1',
        winner: 'AWAY',
        createdAt: '2026-06-12T11:00:00.000Z',
        updatedAt: '2026-06-12T11:30:00.000Z'
      }
    ],
    updatePicks: vi.fn(),
    savePicks: vi.fn(async () => {}),
    saveStatus: 'idle',
    canSave: true
  })
}))

vi.mock('../../../lib/data', () => ({
  fetchPicks: vi.fn(async () => fixtures.picksSnapshot)
}))

import PicksWizardFlow from './PicksWizardFlow'

function renderWizard(layout?: 'standalone' | 'compact-inline') {
  return render(
    <MemoryRouter>
      <PicksWizardFlow layout={layout} />
    </MemoryRouter>
  )
}

describe('PicksWizardFlow layout modes', () => {
  it('renders standalone header by default', async () => {
    renderWizard('standalone')

    expect(screen.getByText('Guided Picks Entry')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open picks reference/i })).toBeInTheDocument()
    expect(screen.getByText('Now playing')).toBeInTheDocument()
    expect(await screen.findByText(/Most picked: BRA 100%/i)).toBeInTheDocument()
    expect(await screen.findByText(/Contrarian/i)).toBeInTheDocument()
  })

  it('hides standalone header in compact-inline while keeping step controls', () => {
    renderWizard('compact-inline')

    expect(screen.queryByText('Guided Picks Entry')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open picks reference/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/group outcomes/i)).not.toBeInTheDocument()
    expect(screen.getByText('Now playing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save \+ next/i })).toBeInTheDocument()
  })
})
