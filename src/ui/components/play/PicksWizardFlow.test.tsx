import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { Match } from '../../../types/matches'

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

  return { matches }
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
    picks: [],
    updatePicks: vi.fn(),
    savePicks: vi.fn(async () => {}),
    saveStatus: 'idle',
    canSave: true
  })
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
  it('renders standalone header by default', () => {
    renderWizard('standalone')

    expect(screen.getByText('Guided Picks Entry')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open picks reference/i })).toBeInTheDocument()
    expect(screen.getByText('Now playing')).toBeInTheDocument()
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
