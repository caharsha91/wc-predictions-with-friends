import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import AdminConsolePage from './AdminConsolePage'

vi.mock('./AdminUsersPage', () => ({ default: () => <div>Players tab content</div> }))
vi.mock('./AdminExportsPage', () => ({ default: () => <div>Exports tab content</div> }))
vi.mock('./DemoControlsPage', () => ({ default: () => <div>Demo tab content</div> }))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}${location.hash}`}</div>
}

describe('AdminConsolePage', () => {
  it('defaults to players tab and normalizes query/hash', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminConsolePage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    )

    expect(screen.getByText('Players tab content')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin?tab=players#players')
  })

  it('loads exports tab from deep link', () => {
    render(
      <MemoryRouter initialEntries={['/admin?tab=exports']}>
        <Routes>
          <Route path="/admin" element={<AdminConsolePage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    )

    expect(screen.getByText('Exports tab content')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin?tab=exports#exports')
  })
})
