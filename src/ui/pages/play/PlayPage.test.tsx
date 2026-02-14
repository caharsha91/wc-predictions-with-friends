import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { Match } from '../../../types/matches'
import type { Pick } from '../../../types/picks'
import type { LeaderboardFile } from '../../../types/leaderboard'
import type { PicksFile } from '../../../types/picks'
import type { MembersFile } from '../../../types/members'

const fixtures = vi.hoisted(() => {
  const state = {
    mode: 'pending' as 'pending' | 'complete' | 'empty',
    nowIso: '2026-06-15T12:00:00.000Z'
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
    },
    {
      id: 'm-r32-1',
      stage: 'R32',
      kickoffUtc: '2026-07-01T18:00:00.000Z',
      status: 'SCHEDULED',
      homeTeam: { code: 'A1', name: 'Group A Winner' },
      awayTeam: { code: 'B2', name: 'Group B Runner-up' }
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

  const leaderboard: LeaderboardFile = {
    lastUpdated: '2026-06-15T12:00:00.000Z',
    entries: [
      {
        member: { id: 'user-2', name: 'Rival Above' },
        totalPoints: 120,
        exactPoints: 30,
        resultPoints: 60,
        knockoutPoints: 10,
        bracketPoints: 20,
        exactCount: 10,
        picksCount: 100
      },
      {
        member: { id: 'user-1', name: 'You' },
        totalPoints: 116,
        exactPoints: 29,
        resultPoints: 59,
        knockoutPoints: 8,
        bracketPoints: 20,
        exactCount: 9,
        picksCount: 99
      },
      {
        member: { id: 'user-3', name: 'Rival Below' },
        totalPoints: 112,
        exactPoints: 28,
        resultPoints: 56,
        knockoutPoints: 8,
        bracketPoints: 20,
        exactCount: 9,
        picksCount: 97
      }
    ]
  }

  const picksFile: PicksFile = {
    picks: [
      {
        userId: 'user-2',
        updatedAt: '2026-06-15T11:45:00.000Z',
        picks: [completedPick]
      },
      {
        userId: 'user-3',
        updatedAt: '2026-06-15T11:30:00.000Z',
        picks: []
      },
      {
        userId: 'user-1',
        updatedAt: '2026-06-15T11:50:00.000Z',
        picks: [completedPick]
      }
    ]
  }

  const members: MembersFile = {
    members: [
      { id: 'user-1', name: 'You' },
      { id: 'user-2', name: 'Rival Above' },
      { id: 'user-3', name: 'Rival Below' }
    ]
  }

  return { state, matches, completedPick, leaderboard, picksFile, members }
})

vi.mock('../../hooks/useNow', () => ({
  useNow: () => new Date(fixtures.state.nowIso)
}))

vi.mock('../../hooks/useViewerId', () => ({
  useViewerId: () => 'user-1'
}))

vi.mock('../../../lib/data', () => ({
  fetchLeaderboard: vi.fn(async () => fixtures.leaderboard),
  fetchPicks: vi.fn(async () => fixtures.picksFile),
  fetchMembers: vi.fn(async () => fixtures.members)
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
    saveStatus: 'idle',
    setGroupPick: vi.fn(),
    setBestThird: vi.fn(),
    save: vi.fn(async () => {}),
    canPersistFirestore: false
  })
}))

vi.mock('../../hooks/useBracketKnockoutData', () => ({
  useBracketKnockoutData: () => ({
    loadState: {
      status: 'ready',
      byStage: {
        R32: [
          {
            id: 'm-r32-1',
            stage: 'R32',
            kickoffUtc: '2026-07-01T18:00:00.000Z',
            status: 'SCHEDULED',
            homeTeam: { code: 'BRA', name: 'Brazil' },
            awayTeam: { code: 'NED', name: 'Netherlands' }
          }
        ]
      }
    },
    knockout: {},
    setPick: vi.fn(),
    save: vi.fn(async () => {}),
    saveStatus: 'idle',
    canPersistFirestore: false,
    stageOrder: ['R32', 'R16', 'QF', 'SF', 'Third', 'Final'],
    totalMatches: 1,
    completeMatches: 0
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
  beforeEach(() => {
    window.localStorage.removeItem('wc-demo-scenario')
    window.localStorage.removeItem('wc-play-rank-momentum:default:user-1')
    fixtures.state.mode = 'pending'
    fixtures.state.nowIso = '2026-06-15T12:00:00.000Z'
    fixtures.matches[0].status = 'SCHEDULED'
    fixtures.matches[1].status = 'SCHEDULED'
    fixtures.matches[2].status = 'SCHEDULED'
    fixtures.matches[3].status = 'SCHEDULED'
    fixtures.matches[3].homeTeam.code = 'A1'
    fixtures.matches[3].awayTeam.code = 'B2'
  })

  it('renders compact group stage section above picks action center', async () => {
    window.localStorage.setItem(
      'wc-play-rank-momentum:default:user-1',
      JSON.stringify({ rank: 5, updatedAt: '2026-06-14T12:00:00.000Z' })
    )
    renderPage()

    expect(screen.getByText(/^Group stage$/i)).toBeInTheDocument()
    expect(screen.getByText(/^Match picks$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue group stage/i })).toBeInTheDocument()
    expect(screen.getAllByText(/pending/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /play center/i })).toBeInTheDocument()
    expect(await screen.findByText(/you gained \+3 rank since last update/i)).toBeInTheDocument()
    expect(await screen.findByText(/^Rivalry$/i)).toBeInTheDocument()
    expect((await screen.findAllByText(/Rival Above/i)).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/Rival Below/i)).length).toBeGreaterThan(0)
    expect(await screen.findByText(/4 pts to catch/i)).toBeInTheDocument()
    expect(await screen.findByText(/4 pts cushion/i)).toBeInTheDocument()
  })

  it('routes group stage CTA to /play/group-stage', () => {
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

  it('routes group stage CTA to /demo/play/group-stage in demo mode', () => {
    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <Routes>
          <Route path="/demo/play" element={<PlayPage />} />
          <Route path="/demo/play/group-stage" element={<div>Demo Group Stage Route</div>} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /continue group stage|open group stage|view group stage/i }))
    expect(screen.getByText('Demo Group Stage Route')).toBeInTheDocument()
  })

  it('renders queue and editor inline in one section for pending picks', () => {
    renderPage()

    expect(screen.getByRole('button', { name: /next pending pick/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
    expect(screen.getAllByText(/closing soon/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/wizard flow mock/i)).toBeInTheDocument()
  })

  it('renders filter chips in priority order', () => {
    renderPage()

    const order = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim() ?? '')
      .filter((label) => ['Live', 'Closing soon', 'Unpicked', 'All'].includes(label))

    expect(order.slice(0, 4)).toEqual(['Live', 'Closing soon', 'Unpicked', 'All'])
  })

  it('updates inline editor context when selecting a queue row action', () => {
    renderPage()

    const civLabel = screen.getByText('CIV vs ECU')
    const civRow = civLabel.closest('div.rounded-xl')
    expect(civRow).not.toBeNull()
    fireEvent.click(within(civRow as HTMLDivElement).getByRole('button', { name: /^open$/i }))

    expect(screen.getByTestId('wizard-active')).toHaveTextContent('m-open-2')
  })

  it('shows triaged queue list and removes duplicate top review shortcuts', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: /pick: /i })).not.toBeInTheDocument()
    expect(screen.getByText('BRA vs NED')).toBeInTheDocument()
    expect(screen.getByText('CIV vs ECU')).toBeInTheDocument()
    expect(screen.getByText('USA vs PAR')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /high swing/i })).not.toBeInTheDocument()
  })

  it('shows live matches only when ongoing by status or kickoff fallback', () => {
    fixtures.state.nowIso = '2026-06-15T19:00:00.000Z'
    fixtures.matches[0].status = 'SCHEDULED'
    fixtures.matches[1].status = 'IN_PLAY'
    fixtures.matches[2].status = 'SCHEDULED'

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /^live$/i }))
    expect(screen.getByText('BRA vs NED')).toBeInTheDocument()
    expect(screen.getByText('CIV vs ECU')).toBeInTheDocument()
    expect(screen.queryByText('USA vs PAR')).not.toBeInTheDocument()
  })

  it('auto-falls back to next filter priority when current filter has no items', () => {
    fixtures.state.nowIso = '2026-06-12T12:00:00.000Z'
    fixtures.matches[0].status = 'SCHEDULED'
    fixtures.matches[1].status = 'SCHEDULED'
    fixtures.matches[2].status = 'SCHEDULED'

    renderPage()

    const liveButton = screen.getByRole('button', { name: /^live$/i })
    const closingSoonButton = screen.getByRole('button', { name: /closing soon/i })
    const unpickedButton = screen.getByRole('button', { name: /^unpicked$/i })
    expect(liveButton).toBeDisabled()
    expect(closingSoonButton).toBeDisabled()
    expect(unpickedButton).toBeEnabled()

    fireEvent.click(liveButton)
    fireEvent.click(closingSoonButton)

    expect(screen.getByText('BRA vs NED')).toBeInTheDocument()
    expect(screen.getByText('CIV vs ECU')).toBeInTheDocument()
    expect(screen.queryByText(/nothing closing soon/i)).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Unpicked$/i).length).toBeGreaterThan(0)
  })

  it('renders collapsible friend activity panel with computed entries', async () => {
    renderPage()

    expect(await screen.findByText(/^Friend activity$/i)).toBeInTheDocument()
    expect(await screen.findByText(/2 recent/i)).toBeInTheDocument()
  })

  it('shows all-caught-up state when there are no upcoming picks', () => {
    fixtures.state.mode = 'empty'

    renderPage()

    expect(screen.getAllByText(/you're chill\./i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /view league/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /see results/i })).toBeInTheDocument()
  })

  it('moves group stage to collapsed row at bottom when group is closed', () => {
    fixtures.state.nowIso = '2026-06-15T19:00:00.000Z'

    renderPage()

    expect(screen.getAllByText(/^Closed$/i).length).toBeGreaterThan(0)
    const matchPicksHeading = screen.getByText(/^Match picks$/i)
    const groupHeading = screen.getByText(/^Group stage$/i)
    expect(matchPicksHeading.compareDocumentPosition(groupHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows knockout as the active top phase after group completion and draw readiness', () => {
    fixtures.state.nowIso = '2026-06-28T12:00:00.000Z'
    fixtures.matches[0].status = 'FINISHED'
    fixtures.matches[1].status = 'FINISHED'
    fixtures.matches[2].status = 'FINISHED'
    fixtures.matches[3].homeTeam.code = 'BRA'
    fixtures.matches[3].awayTeam.code = 'NED'

    renderPage()

    const knockoutHeading = screen.getByText(/^Knockout$/i)
    const groupHeading = screen.getByText(/^Group stage$/i)
    expect(knockoutHeading.compareDocumentPosition(groupHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: /open knockout/i })).toBeInTheDocument()
    expect(screen.getByText(/pending now/i)).toBeInTheDocument()
  })

  it('forces knockout active for demo mid-knockout and shows inference warning when fixtures disagree', () => {
    window.localStorage.setItem('wc-demo-scenario', 'mid-knockout')

    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <PlayPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /open knockout/i })).toBeInTheDocument()
    expect(screen.getByText(/knockout activation override/i)).toBeInTheDocument()
    expect(screen.getByText(/demo scenario override keeps knockout active/i)).toBeInTheDocument()
    expect(screen.getByText(/source of truth: demo scenario override/i)).toBeInTheDocument()
  })

  it('forces knockout active for demo world-cup-final-pending and shows warning when fixtures disagree', () => {
    window.localStorage.setItem('wc-demo-scenario', 'world-cup-final-pending')

    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <PlayPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /open knockout/i })).toBeInTheDocument()
    expect(screen.getByText(/knockout activation override/i)).toBeInTheDocument()
  })

  it('does not show override warning when demo forced state matches fixture inference', () => {
    window.localStorage.setItem('wc-demo-scenario', 'mid-knockout')
    fixtures.state.nowIso = '2026-06-28T12:00:00.000Z'
    fixtures.matches[0].status = 'FINISHED'
    fixtures.matches[1].status = 'FINISHED'
    fixtures.matches[2].status = 'FINISHED'
    fixtures.matches[3].homeTeam.code = 'BRA'
    fixtures.matches[3].awayTeam.code = 'NED'

    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <PlayPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /open knockout/i })).toBeInTheDocument()
    expect(screen.queryByText(/knockout activation override/i)).not.toBeInTheDocument()
  })

  it('forces knockout active in demo end-group-draw-confirmed even when draw inference is pending', () => {
    window.localStorage.setItem('wc-demo-scenario', 'end-group-draw-confirmed')

    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <PlayPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('button', { name: /open knockout/i })).toBeInTheDocument()
    expect(screen.getByText(/knockout activation override/i)).toBeInTheDocument()
  })
})
