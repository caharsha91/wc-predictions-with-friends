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
            <NavItem to="/exports" label="Exports" />
          </nav>
          <div className="headerMeta">
            <span className="metaTag">Friends League</span>
            <span className="metaNote">Season hub</span>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
