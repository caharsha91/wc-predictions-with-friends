import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { Match } from '../../types/matches'

const fixtures = vi.hoisted(() => {
  const state = { unlocked: false }

  const matches: Match[] = [
    {
      id: 'g1',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-10T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'A1', name: 'A Team 1' },
      awayTeam: { code: 'A2', name: 'A Team 2' }
    },
    {
      id: 'r32-1',
      stage: 'R32',
      kickoffUtc: '2026-07-01T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'A1', name: 'Group A Winner' },
      awayTeam: { code: 'B2', name: 'Group B Runner-up' }
    }
  ]

  return { state, matches }
})

vi.mock('../hooks/useNow', () => ({
  useNow: () =>
    fixtures.state.unlocked
      ? new Date('2026-06-10T18:30:01.000Z')
      : new Date('2026-06-10T17:00:00.000Z')
}))

vi.mock('../hooks/usePicksData', () => ({
  usePicksData: () => ({
    state: {
      status: 'ready',
      matches: fixtures.state.unlocked
        ? [
            fixtures.matches[0],
            {
              ...fixtures.matches[1],
              homeTeam: { code: 'BRA', name: 'Brazil' },
              awayTeam: { code: 'NED', name: 'Netherlands' }
            }
          ]
        : fixtures.matches,
      lastUpdated: '2026-06-12T12:00:00.000Z'
    }
  })
}))

vi.mock('../hooks/useBracketKnockoutData', () => ({
  useBracketKnockoutData: () => ({
    loadState: {
      status: 'ready',
      lastUpdated: '2026-06-12T12:00:00.000Z',
      byStage: {
        R32: [
          {
            id: 'r32-1',
            stage: 'R32',
            kickoffUtc: '2026-07-01T18:00:00.000Z',
            status: 'SCHEDULED',
            homeTeam: { code: 'BRA', name: 'Brazil' },
            awayTeam: { code: 'NED', name: 'Netherlands' }
          }
        ]
      }
    },
    knockout: { R32: { 'r32-1': 'HOME' } },
    stageOrder: ['R32', 'R16', 'QF', 'SF', 'Third', 'Final'],
    totalMatches: 1,
    completeMatches: 1
  })
}))

import BracketPage from './BracketPage'

describe('BracketPage read-only detail', () => {
  beforeEach(() => {
    window.localStorage.removeItem('wc-demo-scenario')
  })

  it('shows inactive state before unlock conditions are met', () => {
    fixtures.state.unlocked = false

    render(
      <MemoryRouter initialEntries={['/play/bracket']}>
        <BracketPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/knockout detail is inactive/i)).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /actual winner/i })).not.toBeInTheDocument()
  })

  it('shows read-only bracket table once unlocked', () => {
    fixtures.state.unlocked = true

    render(
      <MemoryRouter initialEntries={['/play/bracket']}>
        <BracketPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('columnheader', { name: /actual winner/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to picks/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save bracket/i })).not.toBeInTheDocument()
  })

  it('forces detail active in demo mid-knockout and shows override warning if inference disagrees', () => {
    fixtures.state.unlocked = false
    window.localStorage.setItem('wc-demo-scenario', 'mid-knockout')

    render(
      <MemoryRouter initialEntries={['/demo/play/bracket']}>
        <BracketPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('columnheader', { name: /actual winner/i })).toBeInTheDocument()
    expect(screen.getByText(/knockout activation override/i)).toBeInTheDocument()
    expect(screen.getByText(/source: demo scenario override/i)).toBeInTheDocument()
  })

  it('forces detail active in demo world-cup-final-pending and shows override warning when inference disagrees', () => {
    fixtures.state.unlocked = false
    window.localStorage.setItem('wc-demo-scenario', 'world-cup-final-pending')

    render(
      <MemoryRouter initialEntries={['/demo/play/bracket']}>
        <BracketPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('columnheader', { name: /actual winner/i })).toBeInTheDocument()
    expect(screen.getByText(/knockout activation override/i)).toBeInTheDocument()
  })

  it('shows demo source badge without warning when forced and inferred state agree', () => {
    fixtures.state.unlocked = true
    window.localStorage.setItem('wc-demo-scenario', 'mid-knockout')

    render(
      <MemoryRouter initialEntries={['/demo/play/bracket']}>
        <BracketPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/source: demo scenario override/i)).toBeInTheDocument()
    expect(screen.queryByText(/knockout activation override/i)).not.toBeInTheDocument()
  })
})
