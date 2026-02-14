import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import PageHeroPanel from './PageHeroPanel'

function renderWithRouter(node: ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('PageHeroPanel', () => {
  it('renders title, subtitle, and meta content', () => {
    renderWithRouter(
      <PageHeroPanel
        kicker="Test"
        title="Hero Title"
        subtitle="Hero subtitle"
        meta={<div>Meta block</div>}
        showMobileNav={false}
      />
    )

    expect(screen.getByText(/hero title/i)).toBeInTheDocument()
    expect(screen.getByText(/hero subtitle/i)).toBeInTheDocument()
    expect(screen.getByText(/meta block/i)).toBeInTheDocument()
  })

  it('renders merged content children', () => {
    renderWithRouter(
      <PageHeroPanel title="Title" showMobileNav={false}>
        <div>Top content area</div>
      </PageHeroPanel>
    )

    expect(screen.getByText(/top content area/i)).toBeInTheDocument()
  })

  it('renders mobile nav trigger when enabled', () => {
    renderWithRouter(
      <PageHeroPanel title="Title" mobileNav={<button type="button">Mobile menu</button>}>
        <div>Content</div>
      </PageHeroPanel>
    )

    expect(screen.getByRole('button', { name: /mobile menu/i })).toBeInTheDocument()
  })
})
