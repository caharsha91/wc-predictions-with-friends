import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import UserInfo from './components/UserInfo'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useAuthState } from './hooks/useAuthState'
import { applyColorMode, getColorMode, setColorMode, type ColorMode } from '../lib/colorMode'
import { firebaseAuth, hasFirebase } from '../lib/firebase'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink')}
      end={to === '/'}
    >
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const user = useCurrentUser()
  const authState = useAuthState()
  const [mode, setMode] = useState<ColorMode>(() => getColorMode())
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    applyColorMode(mode)
  }, [mode])

  function handleToggleMode() {
    const nextMode: ColorMode = mode === 'dark' ? 'light' : 'dark'
    setMode(nextMode)
    setColorMode(nextMode)
  }

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
      <header className="header">
        <div className="headerBar">
          <div className="brandBlock">
            <div className="brandMark" aria-hidden="true">
              WC
            </div>
            <div className="brandStack">
              <div className="brand">WC Predictions</div>
              <div className="brandSub">Under the floodlights</div>
            </div>
          </div>
          <div className="headerActions">
            <button
              className={mode === 'light' ? 'modeToggle active' : 'modeToggle'}
              type="button"
              onClick={handleToggleMode}
              aria-pressed={mode === 'light'}
              aria-label="Toggle light mode"
            >
              {mode === 'light' ? 'Light' : 'Dark'}
            </button>
            {hasFirebase ? (
              authState.user ? (
                <button
                  className="button buttonSmall buttonSecondary"
                  type="button"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              ) : (
                <button className="button buttonSmall" type="button" onClick={handleSignIn}>
                  Sign in
                </button>
              )
            ) : null}
            {user?.name && user.email ? (
              <UserInfo name={user.name} email={user.email} isAdmin={user.isAdmin} />
            ) : null}
          </div>
        </div>
        <div className="headerNav">
          <nav className="navTabs">
            <NavItem to="/upcoming" label="Upcoming" />
            <NavItem to="/results" label="Results" />
            <NavItem to="/bracket" label="Bracket" />
            <NavItem to="/leaderboard" label="Leaderboard" />
          </nav>
          <div className="headerMeta">
            <span className="metaTag">Friends League</span>
            <span className="metaNote">Season hub</span>
            {authError ? <span className="metaNote error">{authError}</span> : null}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
