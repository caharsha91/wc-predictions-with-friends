import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'

import { HomeIcon, ResultsIcon, TrophyIcon, UsersIcon } from '../Icons'
import { companionFeatureFlags } from '../../lib/companionSurface'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useAuthState } from '../../hooks/useAuthState'
import { useToast } from '../../hooks/useToast'
import { clearDemoLocalStorage } from '../../lib/demoStorage'
import { firebaseAuth } from '../../../lib/firebase'
import { Sheet, SheetContent, SheetFooter, SheetHeader } from '../ui/Sheet'

type CompanionNavItem = {
  to: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  end?: boolean
}

type CompanionActionItem = {
  key: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  action: () => void
}

const COMPANION_NAV: CompanionNavItem[] = [
  { to: '/m', label: 'Home', icon: HomeIcon, end: true },
  { to: '/m/picks', label: 'Picks', icon: ResultsIcon },
  { to: '/m/leaderboard', label: 'League', icon: TrophyIcon }
]

export default function MobileCompanionLayout() {
  const navigate = useNavigate()
  const authState = useAuthState()
  const { showToast } = useToast()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  const navItems = COMPANION_NAV.filter((item) => {
    if (item.to === '/m') return companionFeatureFlags.areas.home
    if (item.to === '/m/picks') return companionFeatureFlags.areas.picks
    if (item.to === '/m/leaderboard') return companionFeatureFlags.areas.leaderboard
    return true
  })

  async function handleConfirmLogout() {
    setIsSigningOut(true)
    try {
      clearDemoLocalStorage()
      if (firebaseAuth) await signOut(firebaseAuth)
      setLogoutDialogOpen(false)
      navigate('/m/login', { replace: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out right now.'
      showToast({ title: 'Sign out failed', message, tone: 'danger' })
    } finally {
      setIsSigningOut(false)
    }
  }

  const actionItems: CompanionActionItem[] = [
    {
      key: 'you',
      label: 'You',
      icon: UsersIcon,
      action: () => setLogoutDialogOpen(true)
    }
  ]

  return (
    <div
      className="min-h-screen bg-background"
      data-companion-surface="true"
      data-companion-admin-tools="off"
      data-companion-demo-tools="off"
    >
      <main className="px-4 pb-[calc(var(--bottom-nav-height)+1.25rem)] pt-4">
        <div className="mx-auto grid w-full max-w-3xl gap-3">
          <Outlet />
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--shell-sidebar-divider)] bg-[var(--sidebar-bg)]/95 px-2 py-2 backdrop-blur"
        aria-label="Companion navigation"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
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

          {actionItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.action}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center rounded-lg border text-[length:var(--text-xs)] font-semibold transition',
                  'border-transparent text-[var(--sidebar-nav-muted)]'
                )}
              >
                <Icon size={15} />
                <span className="mt-1 leading-none">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <Sheet open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-xl rounded-t-2xl">
          <SheetHeader className="space-y-1.5 px-4 py-4">
            <div className="v2-type-kicker">You</div>
            <h2 className="text-lg font-semibold text-foreground">Log out</h2>
            <p className="text-sm text-muted-foreground">
              {authState.user?.email ? `Sign out ${authState.user.email}?` : 'Sign out of your companion session?'}
            </p>
          </SheetHeader>
          <SheetFooter className="grid grid-cols-2 gap-2 px-4 py-3">
            <Button variant="secondary" onClick={() => setLogoutDialogOpen(false)} disabled={isSigningOut}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSigningOut} onClick={() => void handleConfirmLogout()}>
              Log out
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
