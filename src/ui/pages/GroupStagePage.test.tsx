import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import type { Match } from '../../types/matches'
import type { GroupPrediction } from '../../types/bracket'

const fixtures = vi.hoisted(() => {
  const groupIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  const matches: Match[] = groupIds.flatMap((groupId, groupIndex) => [
    {
      id: `${groupId}-m1`,
      stage: 'Group' as const,
      group: groupId,
      kickoffUtc: `2026-06-${String(15 + groupIndex).padStart(2, '0')}T18:00:00.000Z`,
      status: 'SCHEDULED' as const,
      homeTeam: { code: `${groupId}1`, name: `${groupId} Team 1` },
      awayTeam: { code: `${groupId}2`, name: `${groupId} Team 2` }
    },
    {
      id: `${groupId}-m2`,
      stage: 'Group' as const,
      group: groupId,
      kickoffUtc: `2026-06-${String(15 + groupIndex).padStart(2, '0')}T21:00:00.000Z`,
      status: 'SCHEDULED' as const,
      homeTeam: { code: `${groupId}3`, name: `${groupId} Team 3` },
      awayTeam: { code: `${groupId}4`, name: `${groupId} Team 4` }
    }
  ])

  const emptyGroups: Record<string, GroupPrediction> = Object.fromEntries(groupIds.map((id) => [id, {}]))
  const completeGroups: Record<string, GroupPrediction> = Object.fromEntries(
    groupIds.map((id) => [id, { first: `${id}1`, second: `${id}2` }])
  )

  return {
    groupIds,
    matches,
    now: new Date('2026-06-01T12:00:00.000Z'),
    groups: emptyGroups,
    bestThirds: [] as string[],
    saveStatus: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
    completeGroups,
    validBestThirds: groupIds.map((id) => `${id}3`),
    save: vi.fn(async () => {}),
    setGroupPick: vi.fn(),
    setBestThird: vi.fn()
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
    setGroupPick: fixtures.setGroupPick,
    setBestThird: fixtures.setBestThird,
    save: fixtures.save,
    saveStatus: fixtures.saveStatus
  })
}))

import GroupStagePage from './GroupStagePage'

function renderPage() {
  return render(
    <MemoryRouter>
      <GroupStagePage />
    </MemoryRouter>
  )
}

describe('GroupStagePage', () => {
  it('shows required validation and blocks save when fields are incomplete', () => {
    fixtures.now = new Date('2026-06-01T12:00:00.000Z')
    fixtures.groups = Object.fromEntries(fixtures.groupIds.map((id) => [id, {}]))
    fixtures.bestThirds = []
    fixtures.saveStatus = 'idle'

    renderPage()

    expect(screen.getAllByText('Required').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /save group stage/i })).toBeDisabled()
  })

  it('enforces unique team and unique group constraints for best-third qualifiers', () => {
    fixtures.now = new Date('2026-06-01T12:00:00.000Z')
    fixtures.groups = fixtures.completeGroups
    fixtures.bestThirds = ['A3', 'A4', 'A3', 'B3', 'C3', 'D3', 'E3', 'F3']

    renderPage()

    expect(screen.getAllByText('Different groups only').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Duplicate team').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /save group stage/i })).toBeDisabled()
  })

  it('renders closed state as read-only', () => {
    fixtures.now = new Date('2026-06-15T18:00:01.000Z')
    fixtures.groups = fixtures.completeGroups
    fixtures.bestThirds = fixtures.validBestThirds

    renderPage()

    expect(screen.getByText(/group stage is closed/i)).toBeInTheDocument()
    expect(screen.getByText(/editing is disabled/i)).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[0]).toBeDisabled()
  })

  it('shows save success and error states', () => {
    fixtures.now = new Date('2026-06-01T12:00:00.000Z')
    fixtures.groups = fixtures.completeGroups
    fixtures.bestThirds = fixtures.validBestThirds

    fixtures.saveStatus = 'saved'
    const { rerender } = renderPage()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    fixtures.saveStatus = 'error'
    rerender(
      <MemoryRouter>
        <GroupStagePage />
      </MemoryRouter>
    )
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })
})
