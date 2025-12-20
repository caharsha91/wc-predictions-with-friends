import { NavLink, Outlet } from 'react-router-dom'

import UserInfo from './components/UserInfo'
import { useCurrentUser } from './hooks/useCurrentUser'

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
              <NavItem to="/" label="Home" />
              <NavItem to="/upcoming" label="Upcoming" />
              <NavItem to="/results" label="Results" />
              <NavItem to="/bracket" label="Bracket" />
              <NavItem to="/leaderboard" label="Leaderboard" />
              <NavItem to="/admin" label="Admin" />
            </nav>
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
