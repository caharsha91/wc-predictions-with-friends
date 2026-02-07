import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'

vi.mock('./hooks/useAuthState', () => ({
  useAuthState: () => ({ status: 'disabled', user: null })
}))

vi.mock('./hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ id: 'user-1', name: 'Demo Player', isMember: true, isAdmin: true })
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
vi.mock('./pages/PicksWizardPage', () => ({ default: () => <div>Picks wizard route</div> }))
vi.mock('./pages/play/PlayPage', () => ({ default: () => <div>Play route</div> }))
vi.mock('./pages/ResultsPage', () => ({ default: () => <div>Results route</div> }))
vi.mock('./pages/BracketPage', () => ({ default: () => <div>Bracket route</div> }))
vi.mock('./pages/LeaderboardPage', () => ({ default: () => <div>Leaderboard route</div> }))
vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login route</div> }))
vi.mock('./pages/JoinLeaguePage', () => ({ default: () => <div>Join route</div> }))
vi.mock('./pages/AdminUsersPage', () => ({ default: () => <div>Players route</div> }))
vi.mock('./pages/AdminExportsPage', () => ({ default: () => <div>Exports route</div> }))
vi.mock('./pages/AccessDeniedPage', () => ({ default: () => <div>Access denied</div> }))
vi.mock('./pages/NotFoundPage', () => ({ default: () => <div>Not found</div> }))

import App from './App'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

describe('App routing', () => {
  it('renders picks by default and navigates to results', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText('Play route')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/play')

    const resultsLink = screen.getAllByRole('link', { name: /results/i })[0]
    fireEvent.click(resultsLink)

    expect(screen.getByText('Results route')).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/play/results')
  })

  it.each([
    ['/picks', '/play/picks', 'Picks route'],
    ['/picks/wizard', '/play/picks/wizard', 'Picks wizard route'],
    ['/results', '/play/results', 'Results route'],
    ['/bracket', '/play/bracket', 'Bracket route'],
    ['/leaderboard', '/play/league', 'Leaderboard route'],
    ['/players', '/admin/players', 'Players route'],
    ['/exports', '/admin/exports', 'Exports route']
  ])('redirects %s to %s', (legacyPath, expectedPath, expectedText) => {
    render(
      <MemoryRouter initialEntries={[legacyPath]}>
        <LocationProbe />
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText(expectedText)).toBeInTheDocument()
    expect(screen.getByTestId('location-probe')).toHaveTextContent(expectedPath)
  })
})
