import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ActionSummaryStrip from './ActionSummaryStrip'

describe('ActionSummaryStrip', () => {
  it('renders inline detail content below actions when provided', () => {
    render(
      <ActionSummaryStrip
        headline="Next action"
        subline="Finish open picks"
        metrics={[{ label: 'Needs action', value: 2, tone: 'warning' }]}
        statusChip={{ type: 'deadline', text: 'Jun 14, 2:30 PM' }}
        primaryAction={{ label: 'Continue next action', onClick: vi.fn() }}
        detail={<div data-testid="summary-detail">Inline step content</div>}
      />
    )

    expect(screen.getByRole('button', { name: /continue next action/i })).toBeInTheDocument()
    expect(screen.getByTestId('summary-detail')).toBeInTheDocument()
    expect(screen.getByText(/inline step content/i)).toBeInTheDocument()
  })
})
