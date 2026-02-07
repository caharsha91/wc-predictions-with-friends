import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlayCenterHero from './PlayCenterHero'

vi.mock('../AppMobileNav', () => ({
  default: () => <button type="button">Menu</button>
}))

describe('PlayCenterHero', () => {
  it('renders title, state badge, summary actions, and side panel', () => {
    render(
      <PlayCenterHero
        title="Play Center"
        subtitle="Game loop hub"
        state="READY_OPEN_PICKS"
        lastUpdatedUtc="2026-02-07T18:00:00.000Z"
        summary={{
          headline: 'Next action',
          metrics: [{ label: 'Needs action', value: 2, tone: 'warning' }],
          statusChip: { type: 'deadline', text: 'Feb 7, 6:30 PM' },
          primaryAction: { label: 'Continue next action', onClick: vi.fn() },
          secondaryAction: { label: 'Open picks queue', onClick: vi.fn() }
        }}
        sidePanel={<div>Queue summary</div>}
      />
    )

    expect(screen.getByRole('heading', { name: /play center/i })).toBeInTheDocument()
    expect(screen.getByText(/^Open picks$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue next action/i })).toBeInTheDocument()
    expect(screen.getByText(/queue summary/i)).toBeInTheDocument()
  })
})
