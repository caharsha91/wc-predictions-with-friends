import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({ status: 'disabled', user: null })
}))

vi.mock('./hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ id: 'user-1', name: 'Demo Player', isMember: true, isAdmin: false })
}))

vi.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'dark',
    isSystemMode: false,
    setMode: vi.fn(),
    setSystemMode: vi.fn(),
    syncNotice: null
  })
}))

import Layout from './Layout'

describe('AppShell layout', () => {
  it('keeps desktop shell viewport-locked and app routes full-width', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>Picks screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getAllByText(/wc predictions/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/picks screen/i)).toBeInTheDocument()

    const grid = screen.getByTestId('app-shell-grid')
    const sidebar = screen.getByTestId('app-shell-sidebar')
    const main = screen.getByTestId('app-shell-main')

    expect(grid.className).toContain('md:h-screen')
    expect(grid.className).toContain('md:overflow-hidden')
    expect(sidebar.className).toContain('md:h-screen')
    expect(main.className).toContain('overflow-y-auto')
    expect(main.className).not.toContain('container')
  })

  it('keeps utility routes centered with container width', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="login" element={<div>Login screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    const main = screen.getByTestId('app-shell-main')
    expect(main.className).toContain('container')
    expect(screen.getByText(/login screen/i)).toBeInTheDocument()
  })
})
