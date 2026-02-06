import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Button } from './Button'

describe('Button', () => {
  it('renders variants and disabled state', () => {
    render(
      <div>
        <Button variant="primary">Primary action</Button>
        <Button variant="secondary" disabled>
          Disabled secondary
        </Button>
      </div>
    )

    expect(screen.getByRole('button', { name: /primary action/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /disabled secondary/i })).toBeDisabled()
  })
})

