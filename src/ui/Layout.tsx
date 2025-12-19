import { NavLink, Outlet } from 'react-router-dom'

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
  return (
    <div className="appShell">
      <header className="header">
        <div className="headerInner">
          <div className="brand">WC Predictions</div>
          <nav className="nav">
            <NavItem to="/" label="Home" />
            <NavItem to="/matches" label="Matches" />
            <NavItem to="/leaderboard" label="Leaderboard" />
            <NavItem to="/admin" label="Admin" />
          </nav>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

