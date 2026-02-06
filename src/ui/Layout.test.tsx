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
  it('renders sidebar and topbar shell', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<div>Picks screen</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText(/world cup predictions/i)).toBeInTheDocument()
    expect(screen.getByText(/picks screen/i)).toBeInTheDocument()
    expect(screen.getAllByText(/picks/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/leaderboard/i).length).toBeGreaterThan(0)
  })
})
