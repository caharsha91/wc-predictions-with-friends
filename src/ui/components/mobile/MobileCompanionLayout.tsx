import { NavLink, Outlet } from 'react-router-dom'

import { HomeIcon, ResultsIcon, TrophyIcon } from '../Icons'
import { companionFeatureFlags } from '../../lib/companionSurface'
import { cn } from '../../lib/utils'

type CompanionNavItem = {
  to: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  end?: boolean
}

const COMPANION_NAV: CompanionNavItem[] = [
  { to: '/m', label: 'Home', icon: HomeIcon, end: true },
  { to: '/m/predictions', label: 'Predictions', icon: ResultsIcon },
  { to: '/m/leaderboard', label: 'League', icon: TrophyIcon }
]

export default function MobileCompanionLayout() {
  const navItems = COMPANION_NAV.filter((item) => {
    if (item.to === '/m') return companionFeatureFlags.areas.home
    if (item.to === '/m/predictions') return companionFeatureFlags.areas.predictions
    if (item.to === '/m/leaderboard') return companionFeatureFlags.areas.leaderboard
    return true
  })

  return (
    <div className="min-h-screen bg-background" data-companion-surface="true" data-companion-admin-tools="off" data-companion-demo-tools="off">
      <main className="px-4 pb-[calc(var(--bottom-nav-height)+1.25rem)] pt-4">
        <Outlet />
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--shell-sidebar-divider)] bg-[var(--sidebar-bg)]/95 px-2 py-2 backdrop-blur"
        aria-label="Companion navigation"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 flex-col items-center justify-center rounded-lg border text-[length:var(--text-xs)] font-semibold transition',
                    isActive
                      ? 'border-[var(--sidebar-border)] bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-nav-foreground)]'
                      : 'border-transparent text-[var(--sidebar-nav-muted)]'
                  )
                }
              >
                <Icon size={15} />
                <span className="mt-1 leading-none">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
