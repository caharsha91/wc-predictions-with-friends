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

vi.mock('../../../lib/data', () => ({
  fetchScoring: vi.fn(async () => ({
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
      thirdPlaceQualifiers: 0,
      knockout: { R32: 2, R16: 3, QF: 4, SF: 5, Third: 2, Final: 8 }
    }
  }))
}))

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

vi.mock('../../hooks/useGroupOutcomesData', () => ({
  useGroupOutcomesData: () => ({
    loadState: { status: 'ready' },
    data: { groups: {}, bestThirds: [], updatedAt: '2026-06-12T12:00:00.000Z' },
    groupIds: [],
    setGroupPick: vi.fn(),
    setBestThird: vi.fn(),
    save: vi.fn(async () => {}),
    saveStatus: 'idle'
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
    expect(screen.getByText('Now playing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save \+ next/i })).toBeInTheDocument()
  })
})
