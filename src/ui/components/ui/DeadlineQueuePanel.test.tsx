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

  it('paginates with first, prev, and next controls', () => {
    render(
      <DeadlineQueuePanel
        pageSize={3}
        items={[
          { id: 'match-1', label: 'AAA vs BBB', status: 'Needs pick' },
          { id: 'match-2', label: 'CCC vs DDD', status: 'Needs pick' },
          { id: 'match-3', label: 'EEE vs FFF', status: 'Needs pick' },
          { id: 'match-4', label: 'GGG vs HHH', status: 'Needs pick' }
        ]}
      />
    )

    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/ggg vs hhh/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument()
    expect(screen.getByText(/ggg vs hhh/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^first$/i }))
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument()
    expect(screen.queryByText(/ggg vs hhh/i)).not.toBeInTheDocument()
  })
})
