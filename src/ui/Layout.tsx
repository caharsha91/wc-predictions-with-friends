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

  function handleColorModeChange(next: 'light' | 'dark') {
    setColorModeState(next)
    setColorMode(next)
  }

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
            </nav>
            <div className="modeToggle" role="group" aria-label="Color mode">
              <button
                className={colorMode === 'dark' ? 'modeToggleButton active' : 'modeToggleButton'}
                type="button"
                onClick={() => handleColorModeChange('dark')}
              >
                Dark
              </button>
              <button
                className={colorMode === 'light' ? 'modeToggleButton active' : 'modeToggleButton'}
                type="button"
                onClick={() => handleColorModeChange('light')}
              >
                Light
              </button>
            </div>
            {user?.name && user.email ? (
              <UserInfo name={user.name} email={user.email} isAdmin={user.isAdmin} />
            ) : null}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
