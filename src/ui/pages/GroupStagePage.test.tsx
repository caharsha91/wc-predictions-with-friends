import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { GroupPrediction } from '../../types/bracket'
import type { Match } from '../../types/matches'

const fixtures = vi.hoisted(() => {
  const groupIds = ['A', 'B']
  const matches: Match[] = [
    {
      id: 'A-m1',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-15T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'A1', name: 'A Team 1' },
      awayTeam: { code: 'A2', name: 'A Team 2' }
    },
    {
      id: 'A-m2',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-15T21:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'A3', name: 'A Team 3' },
      awayTeam: { code: 'A4', name: 'A Team 4' }
    },
    {
      id: 'B-m1',
      stage: 'Group',
      group: 'B',
      kickoffUtc: '2026-06-16T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'B1', name: 'B Team 1' },
      awayTeam: { code: 'B2', name: 'B Team 2' }
    },
    {
      id: 'B-m2',
      stage: 'Group',
      group: 'B',
      kickoffUtc: '2026-06-16T21:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'B3', name: 'B Team 3' },
      awayTeam: { code: 'B4', name: 'B Team 4' }
    }
  ]

  const groups: Record<string, GroupPrediction> = {
    A: { first: 'A1', second: 'A2' },
    B: { first: 'B1', second: 'B2' }
  }

  return {
    groupIds,
    matches,
    now: new Date('2026-06-01T12:00:00.000Z'),
    groups,
    bestThirds: ['A3', 'B3', '', '', '', '', '', '']
  }
})

vi.mock('../hooks/useNow', () => ({
  useNow: () => fixtures.now
}))

vi.mock('../hooks/usePicksData', () => ({
  usePicksData: () => ({
    state: {
      status: 'ready',
      matches: fixtures.matches,
      lastUpdated: '2026-06-12T12:00:00.000Z'
    }
  })
}))

vi.mock('../hooks/useGroupStageData', () => ({
  useGroupStageData: () => ({
    loadState: { status: 'ready' },
    data: {
      groups: fixtures.groups,
      bestThirds: fixtures.bestThirds,
      updatedAt: '2026-06-12T12:00:00.000Z'
    },
    groupIds: fixtures.groupIds,
    setGroupPick: vi.fn(),
    setBestThird: vi.fn(),
    save: vi.fn(async () => {}),
    saveStatus: 'idle'
  })
}))

import GroupStagePage from './GroupStagePage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/play/group-stage']}>
      <GroupStagePage />
    </MemoryRouter>
  )
}

describe('GroupStagePage read-only detail', () => {
  it('renders read-only detail layout with header play-center link', () => {
    fixtures.now = new Date('2026-06-01T12:00:00.000Z')

    renderPage()

    expect(screen.getByRole('heading', { name: /group stage detail/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to play center/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^edit$/i }).length).toBeGreaterThan(0)
  })

  it('shows closed badge and alert after lock', () => {
    fixtures.now = new Date('2026-06-15T18:30:01.000Z')

    renderPage()

    expect(screen.getAllByText(/group stage is closed/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/detail view only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })

  it('renders incomplete status when groups are not fully finished', () => {
    fixtures.now = new Date('2026-06-01T12:00:00.000Z')

    renderPage()

    expect(screen.getAllByText(/incomplete/i).length).toBeGreaterThan(0)
  })
})
