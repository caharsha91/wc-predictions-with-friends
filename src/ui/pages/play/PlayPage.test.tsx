import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { Match } from '../../../types/matches'
import type { Pick } from '../../../types/picks'

const fixtures = vi.hoisted(() => {
  const state = {
    mode: 'pending' as 'pending' | 'complete' | 'empty'
  }

  const matches: Match[] = [
    {
      id: 'm-open-1',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-15T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'BRA', name: 'Brazil' },
      awayTeam: { code: 'NED', name: 'Netherlands' }
    },
    {
      id: 'm-open-2',
      stage: 'Group',
      group: 'A',
      kickoffUtc: '2026-06-15T21:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'CIV', name: 'Ivory Coast' },
      awayTeam: { code: 'ECU', name: 'Ecuador' }
    },
    {
      id: 'm-open-3',
      stage: 'Group',
      group: 'B',
      kickoffUtc: '2026-06-16T21:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'USA', name: 'United States' },
      awayTeam: { code: 'PAR', name: 'Paraguay' }
    }
  ]

  const completedPick: Pick = {
    id: 'pick-open-1',
    matchId: 'm-open-1',
    userId: 'user-1',
    homeScore: 1,
    awayScore: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  }

  return { state, matches, completedPick }
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
      matches: fixtures.state.mode === 'empty' ? [] : fixtures.matches,
      lastUpdated: '2026-06-12T12:00:00.000Z'
    },
    picks: fixtures.state.mode === 'complete' ? [fixtures.completedPick] : [],
    updatePicks: vi.fn(),
    savePicks: vi.fn(async () => {}),
    saveStatus: 'idle',
    canSave: true
  })
}))

vi.mock('../../hooks/useGroupStageData', () => ({
  useGroupStageData: () => ({
    loadState: { status: 'ready' },
    data: {
      groups: {
        A: { first: 'BRA', second: 'NED' },
        B: {}
      },
      bestThirds: ['CIV', '', '', '', '', '', '', ''],
      updatedAt: '2026-06-12T12:00:00.000Z'
    },
    groupIds: ['A', 'B'],
    saveStatus: 'idle'
  })
}))

vi.mock('../../components/play/PicksWizardFlow', () => ({
  default: ({
    activeMatchId,
    onActiveMatchChange
  }: {
    activeMatchId?: string | null
    onActiveMatchChange?: (matchId: string | null) => void
  }) => (
    <div>
      <div>Wizard Flow Mock</div>
      <div data-testid="wizard-active">{activeMatchId ?? 'none'}</div>
      <button type="button" onClick={() => onActiveMatchChange?.('m-open-2')}>
        Wizard jump
      </button>
    </div>
  )
}))

import PlayPage from './PlayPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PlayPage />
    </MemoryRouter>
  )
}

describe('PlayPage action center', () => {
  it('renders compact group stage section above picks action center', () => {
    fixtures.state.mode = 'pending'

    renderPage()

    expect(screen.getByText(/^Group stage$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue group stage/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /play center/i })).toBeInTheDocument()
  })

  it('routes group stage CTA to /play/group-stage', () => {
    fixtures.state.mode = 'pending'

    render(
      <MemoryRouter initialEntries={['/play']}>
        <Routes>
          <Route path="/play" element={<PlayPage />} />
          <Route path="/play/group-stage" element={<div>Group Stage Route</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /continue group stage|open group stage|view group stage/i }))
    expect(screen.getByText('Group Stage Route')).toBeInTheDocument()
  })

  it('renders queue and editor inline in one section for pending picks', () => {
    fixtures.state.mode = 'pending'

    renderPage()

    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next one/i })).toBeInTheDocument()
    expect(screen.getByText(/closing soon/i)).toBeInTheDocument()
    expect(screen.getByText(/wizard flow mock/i)).toBeInTheDocument()
  })

  it('updates inline editor context when selecting a queue row action', () => {
    fixtures.state.mode = 'pending'

    renderPage()

    const civLabel = screen.getByText('CIV vs ECU')
    const civRow = civLabel.closest('div.rounded-xl')
    expect(civRow).not.toBeNull()
    fireEvent.click(within(civRow as HTMLDivElement).getByRole('button', { name: /^open$/i }))

    expect(screen.getByTestId('wizard-active')).toHaveTextContent('m-open-2')
  })

  it('shows only the next upcoming matchday in locks-next queue and removes duplicate top review shortcuts', () => {
    fixtures.state.mode = 'pending'

    renderPage()

    expect(screen.queryByRole('button', { name: /pick: /i })).not.toBeInTheDocument()
    expect(screen.getByText('BRA vs NED')).toBeInTheDocument()
    expect(screen.getByText('CIV vs ECU')).toBeInTheDocument()
    expect(screen.queryByText('USA vs PAR')).not.toBeInTheDocument()
  })

  it('shows all-caught-up state when there are no upcoming picks', () => {
    fixtures.state.mode = 'empty'

    renderPage()

    expect(screen.getAllByText(/you're chill\./i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /view league/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /see results/i })).toBeInTheDocument()
  })
})
