import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import BrandLogo from './BrandLogo'

describe('BrandLogo', () => {
  it('renders full variant with wordmark', () => {
    render(<BrandLogo variant="full" />)

    expect(screen.getByLabelText(/wc predictions/i)).toBeInTheDocument()
    expect(screen.getByText(/wc predictions/i)).toBeInTheDocument()
    expect(screen.getByText(/private league/i)).toBeInTheDocument()
  })

  it('renders mark-only variant without wordmark text', () => {
    render(<BrandLogo variant="mark" />)

    expect(screen.getByLabelText(/wc predictions/i)).toBeInTheDocument()
    expect(screen.queryByText(/private league/i)).not.toBeInTheDocument()
  })

  it('supports interactive mark button callbacks', () => {
    const onClick = vi.fn()
    render(<BrandLogo variant="mark" markButtonProps={{ onClick }} />)

    fireEvent.click(screen.getByRole('button', { name: /wc predictions logo/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
