import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import UserInfo from './components/UserInfo'
import { AppShellProvider, useAppShell } from './components/AppShellContext'
import {
  BracketIcon,
  CalendarIcon,
  ExportIcon,
  ResultsIcon,
  SimulationIcon,
  TrophyIcon,
  UsersIcon
} from './components/Icons'
import { Button } from './components/ui/Button'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useAuthState } from './hooks/useAuthState'
import { useSimulationState } from './hooks/useSimulationState'
import { firebaseAuth, hasFirebase } from '../lib/firebase'

const PAGE_TITLES: Record<string, string> = {
  upcoming: 'Upcoming',
  results: 'Results',
  bracket: 'Bracket',
  leaderboard: 'Leaderboard',
  users: 'Users',
  simulation: 'Simulation',
  exports: 'Exports'
}

const NAV_ITEMS = [
  { to: '/upcoming', label: 'Upcoming', icon: CalendarIcon },
  { to: '/results', label: 'Results', icon: ResultsIcon },
  { to: '/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { to: '/simulation', label: 'Simulation', icon: SimulationIcon, adminOnly: true },
  { to: '/exports', label: 'Exports', icon: ExportIcon, adminOnly: true }
]

function LayoutFrame() {
  const user = useCurrentUser()
  const authState = useAuthState()
  const simulation = useSimulationState()
  const [authError, setAuthError] = useState<string | null>(null)
  const canAccessAdmin = simulation.enabled || user?.isAdmin
  const location = useLocation()
  const appShell = useAppShell()
  const topBarAction = appShell?.topBarAction ?? null
  const routeKey = location.pathname.split('/')[1] || 'upcoming'
  const pageTitle = PAGE_TITLES[routeKey] ?? 'WC Predictions'
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || canAccessAdmin)

  async function handleSignIn() {
    if (!firebaseAuth) return
    setAuthError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(firebaseAuth, provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      setAuthError(message)
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return
    setAuthError(null)
    try {
      await signOut(firebaseAuth)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out.'
      setAuthError(message)
    }
  }

  return (
    <div className="appShell">
      {simulation.enabled ? (
        <div className="simulationBanner">SIMULATION MODE (LOCAL ONLY)</div>
      ) : null}
      <header className="header">
        <div className="headerBar">
          <div className="brandBlock">
            <div className="brandMark" aria-hidden="true">
              WC
            </div>
            <div className="brandStack">
              <div className="brand">{pageTitle}</div>
              <div className="brandSub">WC Predictions · Friends League</div>
            </div>
          </div>
          <div className="headerActions">
            {topBarAction ? <div className="primaryActionSlot">{topBarAction}</div> : null}
            {hasFirebase && !simulation.enabled ? (
              authState.user ? (
                <Button size="sm" variant="secondary" type="button" onClick={handleSignOut}>
                  Sign out
                </Button>
              ) : (
                <Button size="sm" type="button" onClick={handleSignIn}>
                  Sign in
                </Button>
              )
            ) : null}
            {user?.name && user.email ? (
              <UserInfo name={user.name} email={user.email} isAdmin={user.isAdmin} />
            ) : null}
            {authError ? <span className="authErrorTag">{authError}</span> : null}
          </div>
        </div>
        <div className="headerNav">
          <nav className="navTabs">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink')}
                end={item.to === '/'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="headerMeta">
            <span className="metaTag">Stadium Night</span>
            <span className="metaNote">Neon picks hub</span>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <nav className="bottomNav" aria-label="Primary">
        <div className="bottomNavInner">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'bottomNavLink bottomNavLinkActive' : 'bottomNavLink'
                }
                end={item.to === '/'}
              >
                <span className="bottomNavIcon">
                  <Icon />
                </span>
                <span className="bottomNavLabel">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default function Layout() {
  return (
    <AppShellProvider>
      <LayoutFrame />
    </AppShellProvider>
  )
}
