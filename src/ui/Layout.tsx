import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import UserInfo from './components/UserInfo'
import { useCurrentUser } from './hooks/useCurrentUser'
import { getColorMode, setColorMode } from '../lib/colorMode'

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
  const [colorMode, setColorModeState] = useState(getColorMode())

  function handleColorModeToggle() {
    const next = colorMode === 'light' ? 'dark' : 'light'
    setColorModeState(next)
    setColorMode(next)
  }

  const isLight = colorMode === 'light'

  return (
    <div className="appShell">
      <header className="header">
        <div className="headerTicker">
          <span className="onAirDot" aria-hidden="true" />
          <span>Stadium Light Edition</span>
        </div>
        <div className="headerInner">
          <div className="brandStack">
            <div className="brand">WC Predictions</div>
            <div className="brandSub">Under the floodlights</div>
          </div>
          <div className="headerRight">
            <nav className="nav">
              <NavItem to="/upcoming" label="Upcoming" />
              <NavItem to="/results" label="Results" />
              <NavItem to="/bracket" label="Bracket" />
              <NavItem to="/leaderboard" label="Leaderboard" />
              <NavItem to="/admin" label="Admin" />
            </nav>
            <button
              className="themeToggle"
              type="button"
              role="switch"
              aria-checked={isLight}
              onClick={handleColorModeToggle}
            >
              <span className="themeToggleText">
                <span className="themeToggleKicker">Mode</span>
                <span className="themeToggleName">{isLight ? 'Light' : 'Dark'}</span>
              </span>
              <span className="themeToggleTrack" aria-hidden="true">
                <span className="themeToggleThumb" />
              </span>
            </button>
            {user?.name && user.email ? <UserInfo name={user.name} email={user.email} /> : null}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
