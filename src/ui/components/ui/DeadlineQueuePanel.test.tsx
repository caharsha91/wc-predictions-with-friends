import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import DeadlineQueuePanel from './DeadlineQueuePanel'

describe('DeadlineQueuePanel', () => {
  it('renders empty message', () => {
    render(<DeadlineQueuePanel items={[]} emptyMessage="No queue items" />)
    expect(screen.getByText(/no queue items/i)).toBeInTheDocument()
  })

  it('respects page size and fires open callback', () => {
    const onOpenItem = vi.fn()
    render(
      <DeadlineQueuePanel
        pageSize={1}
        onOpenItem={onOpenItem}
        items={[
          { id: 'match-1', label: 'AAA vs BBB', status: 'Needs pick' },
          { id: 'match-2', label: 'CCC vs DDD', status: 'Needs pick' }
        ]}
      />
    )

    expect(screen.getByText(/aaa vs bbb/i)).toBeInTheDocument()
    expect(screen.queryByText(/ccc vs ddd/i)).not.toBeInTheDocument()

    const openButtons = screen.getAllByRole('button', { name: /open/i })
    fireEvent.click(openButtons[openButtons.length - 1])
    expect(onOpenItem).toHaveBeenCalledWith('match-1')
  })

  it('supports inline container mode', () => {
    render(
      <DeadlineQueuePanel
        container="inline"
        items={[{ id: 'match-1', label: 'AAA vs BBB', status: 'Needs pick' }]}
      />
    )

    expect(screen.getByText(/closing soon/i)).toBeInTheDocument()
    expect(screen.getByText(/aaa vs bbb/i)).toBeInTheDocument()
  })
})
