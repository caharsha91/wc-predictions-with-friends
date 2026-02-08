import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

const mockCurrentUser = vi.hoisted(() => ({
  value: { id: 'user-1', name: 'Demo Player', isMember: true, isAdmin: true }
}))

vi.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({ status: 'disabled', user: null })
}))

vi.mock('./hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockCurrentUser.value
}))

vi.mock('../lib/firebase', () => ({
  hasFirebase: false,
  firebaseAuth: null
}))

vi.mock('./hooks/useEasterEggs', () => ({
  useEasterEggs: () => ({
    sidebarCompact: false,
    notice: null,
    popHighlightActive: false,
    onLogoClick: vi.fn(),
    onLogoPointerDown: vi.fn(),
    onLogoPointerUp: vi.fn(),
    onLogoPointerLeave: vi.fn(),
    onLogoPointerCancel: vi.fn(),
    onLastUpdatedTap: vi.fn()
  })
}))

vi.mock('./pages/PicksPage', () => ({ default: () => <div>Picks route</div> }))
vi.mock('./pages/GroupStagePage', () => ({ default: () => <div>Group stage route</div> }))
vi.mock('./pages/play/PlayPage', () => ({ default: () => <div>Play route</div> }))
vi.mock('./pages/BracketPage', () => ({ default: () => <div>Bracket route</div> }))
vi.mock('./pages/LeaderboardPage', () => ({ default: () => <div>Leaderboard route</div> }))
vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login route</div> }))
vi.mock('./pages/DemoControlsPage', () => ({ default: () => <div>Demo controls route</div> }))
vi.mock('./pages/AdminUsersPage', () => ({ default: () => <div>Players route</div> }))
vi.mock('./pages/AdminExportsPage', () => ({ default: () => <div>Exports route</div> }))
vi.mock('./pages/AccessDeniedPage', () => ({ default: () => <div>Access denied</div> }))
vi.mock('./pages/NotFoundPage', () => ({ default: () => <div>Not found</div> }))

import App from './App'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

describe('App routing', () => {
  it('redirects non-admin users away from demo routes', () => {
    mockCurrentUser.value = { id: 'user-2', name: 'Member', isMember: true, isAdmin: false }

    render(
      <MemoryRouter initialEntries={['/demo/play']}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText('Play route')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/play')

    mockCurrentUser.value = { id: 'user-1', name: 'Demo Player', isMember: true, isAdmin: true }
  })

  it('renders play by default and navigates to picks', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText('Play route')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/play')

    const picksLink = screen.getAllByRole('link', { name: /picks/i })[0]
    fireEvent.click(picksLink)

    expect(screen.getByText('Picks route')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/play/picks')
  })

  it.each(['/missing', '/legacy', '/v1/route'])('treats %s as not found', (missingPath) => {
    render(
      <MemoryRouter initialEntries={[missingPath]}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText('Not found')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent(missingPath)
  })

  it.each([
    ['/play/picks', 'Picks route'],
    ['/play/group-stage', 'Group stage route'],
    ['/play/bracket', 'Bracket route'],
    ['/play/league', 'Leaderboard route'],
    ['/demo/play', 'Play route'],
    ['/demo/play/picks', 'Picks route'],
    ['/demo/play/group-stage', 'Group stage route'],
    ['/demo/play/bracket', 'Bracket route'],
    ['/demo/play/league', 'Leaderboard route'],
    ['/admin/players', 'Players route'],
    ['/admin/exports', 'Exports route'],
    ['/demo/admin/controls', 'Demo controls route'],
    ['/demo/admin/players', 'Players route'],
    ['/demo/admin/exports', 'Exports route']
  ])('keeps canonical route %s', (path, expectedText) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText(expectedText)).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent(path)
  })
})
