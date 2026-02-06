import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import { firebaseAuth, hasFirebase } from '../lib/firebase'
import { useTheme } from '../theme/ThemeProvider'
import { AppShellProvider, useAppShell } from './components/AppShellContext'
import { BracketIcon, CalendarIcon, ResultsIcon, SettingsIcon, TrophyIcon, UsersIcon } from './components/Icons'
import { Badge } from './components/ui/Badge'
import { Button, ButtonLink } from './components/ui/Button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './components/ui/Sheet'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { cn } from './lib/utils'

type NavItem = {
  to: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  end?: boolean
}

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Picks', icon: CalendarIcon, end: true },
  { to: '/results', label: 'Results', icon: ResultsIcon },
  { to: '/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon }
]

const SETTINGS_NAV: NavItem[] = [{ to: '/settings', label: 'Settings', icon: SettingsIcon }]

function getInitials(name?: string | null, email?: string | null) {
  const base = name || email || ''
  if (!base) return 'WC'
  const parts = base.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/picks/wizard')) return 'Picks Wizard'
  if (pathname === '/' || pathname.startsWith('/picks')) return 'Picks'
  if (pathname.startsWith('/results')) return 'Results'
  if (pathname.startsWith('/bracket')) return 'Bracket'
  if (pathname.startsWith('/leaderboard')) return 'Leaderboard'
  if (pathname.startsWith('/players')) return 'Players'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/login')) return 'Login'
  if (pathname.startsWith('/join/')) return 'Join League'
  if (pathname.startsWith('/access-denied')) return 'Access Denied'
  return 'World Cup Predictions'
}

function SidebarNavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="space-y-2">
      <div className="px-2 text-[11px] uppercase tracking-[0.28em] text-[var(--sidebar-nav-muted)]">{title}</div>
      <div className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                  isActive
                    ? 'border-[var(--sidebar-border)] bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-nav-foreground)]'
                    : 'border-transparent text-[var(--sidebar-nav-muted)] hover:border-[var(--sidebar-border)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--sidebar-nav-foreground)]'
                )
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

function MobileNav({ canAccessAdmin }: { canAccessAdmin: boolean }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="Open navigation">
          Menu
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-[320px] border-r-0">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Move between picks, results, standings, and players.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-2 px-4 py-4">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon
            return (
              <SheetClose asChild key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      isActive ? 'border-border1 bg-bg2 text-foreground' : 'border-border/70 text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              </SheetClose>
            )
          })}

          {canAccessAdmin ? (
            <SheetClose asChild>
              <NavLink
                to="/players"
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    isActive ? 'border-border1 bg-bg2 text-foreground' : 'border-border/70 text-muted-foreground hover:text-foreground'
                  )
                }
              >
                <UsersIcon size={16} />
                <span>Players</span>
              </NavLink>
            </SheetClose>
          ) : null}

          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon
            return (
              <SheetClose asChild key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      isActive ? 'border-border1 bg-bg2 text-foreground' : 'border-border/70 text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              </SheetClose>
            )
          })}
        </div>

        <SheetFooter>
          <div className="text-xs text-muted-foreground">Browser only. Install not supported in this version.</div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function AccountPanel({
  initials,
  canAccessAdmin,
  onSignOut,
  authError
}: {
  initials: string
  canAccessAdmin: boolean
  onSignOut: () => Promise<void>
  authError: string | null
}) {
  const user = useCurrentUser()
  const authState = useAuthState()
  const { mode, isSystemMode, setMode, setSystemMode } = useTheme()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[var(--surface-muted)] text-xs font-semibold uppercase text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          type="button"
          aria-label="Open account panel"
        >
          {initials}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] max-w-sm">
        <SheetHeader>
          <SheetTitle>Account</SheetTitle>
          <SheetDescription>Profile, appearance, and session controls.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-1">
          <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] p-3">
            <div className="text-sm font-semibold text-foreground">
              {user?.name || authState.user?.displayName || 'Signed in'}
            </div>
            <div className="text-xs text-muted-foreground">
              {user?.email || authState.user?.email || 'No email on file'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {user?.isAdmin ? <Badge tone="info">Admin</Badge> : null}
              {user?.isMember ? <Badge>Member</Badge> : <Badge tone="warning">No league access</Badge>}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Theme</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="pill"
                size="sm"
                data-active={!isSystemMode && mode === 'light' ? 'true' : 'false'}
                aria-pressed={!isSystemMode && mode === 'light'}
                onClick={() => setMode('light')}
              >
                Light
              </Button>
              <Button
                type="button"
                variant="pill"
                size="sm"
                data-active={!isSystemMode && mode === 'dark' ? 'true' : 'false'}
                aria-pressed={!isSystemMode && mode === 'dark'}
                onClick={() => setMode('dark')}
              >
                Dark
              </Button>
              <Button
                type="button"
                variant="pill"
                size="sm"
                data-active={isSystemMode ? 'true' : 'false'}
                aria-pressed={isSystemMode}
                onClick={() => setSystemMode(true)}
              >
                System
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/settings" variant="secondary" size="sm">
              Open settings
            </ButtonLink>
            {canAccessAdmin ? (
              <ButtonLink to="/players" variant="secondary" size="sm">
                Open players
              </ButtonLink>
            ) : null}
          </div>

          {authError ? <div className="text-xs text-destructive">{authError}</div> : null}
        </div>

        <SheetFooter className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Browser only.</div>
          <Button variant="ghost" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function LayoutFrame() {
  const user = useCurrentUser()
  const authState = useAuthState()
  const [authError, setAuthError] = useState<string | null>(null)
  const location = useLocation()
  const headerRef = useRef<HTMLElement | null>(null)
  const appShell = useAppShell()
  const topBarAction = appShell?.topBarAction ?? null
  const pageTitle = getPageTitle(location.pathname)
  const canAccessAdmin = user?.isAdmin === true

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const updateHeaderHeight = () => {
      const height = header.getBoundingClientRect().height
      document.documentElement.style.setProperty('--app-header-height', `${height}px`)
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeaderHeight)
      return () => window.removeEventListener('resize', updateHeaderHeight)
    }

    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

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

  const initials = getInitials(user?.name, user?.email)

  return (
    <div className="min-h-screen bg-background bg-[var(--shell-bg-overlay)] bg-no-repeat">
      <div className="min-h-screen md:grid md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-screen flex-col border-r border-[var(--shell-sidebar-divider)] bg-[var(--sidebar-bg)] px-4 py-5 shadow-[var(--shadow1)] md:flex">
          <div className="flex items-center gap-3 px-2 pb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-mark-bg)] text-sm font-semibold uppercase tracking-[0.2em] text-[var(--brand-mark-text)] shadow-soft font-display">
              WC
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-nav-foreground)]">
                WC Predictions
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--sidebar-nav-muted)]">
                Private league
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Primary">
            <SidebarNavSection title="Main" items={MAIN_NAV} />
            {canAccessAdmin ? (
              <SidebarNavSection
                title="Admin"
                items={[{ to: '/players', label: 'Players', icon: UsersIcon }]}
              />
            ) : null}
            <SidebarNavSection title="Account" items={SETTINGS_NAV} />
          </div>

          <div className="mt-6 space-y-3 border-t border-[var(--shell-sidebar-divider)] pt-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-nav-hover-bg)] p-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[var(--sidebar-nav-foreground)]">
                  {user?.name || authState.user?.displayName || 'Guest'}
                </div>
                <div className="truncate text-[11px] text-[var(--sidebar-nav-muted)]">
                  {user?.email || authState.user?.email || 'Signed out'}
                </div>
              </div>
              {authState.user ? (
                <AccountPanel
                  initials={initials}
                  canAccessAdmin={canAccessAdmin}
                  onSignOut={handleSignOut}
                  authError={authError}
                />
              ) : null}
            </div>
            <div className="px-1 text-[11px] text-[var(--sidebar-nav-muted)]">
              Browser only. Install not supported in this version.
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header
            ref={headerRef}
            className="sticky top-0 z-40 border-b border-[var(--shell-header-border)] bg-[var(--header-bg)] shadow-[var(--shadow0)] backdrop-blur"
          >
            <div className="container flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2 md:hidden">
                <MobileNav canAccessAdmin={canAccessAdmin} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{pageTitle}</div>
                <div className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                  World Cup Predictions
                </div>
              </div>

              <div className="flex items-center gap-2">
                {topBarAction ? <div>{topBarAction}</div> : null}
                {hasFirebase && !authState.user ? (
                  <Button size="sm" type="button" onClick={handleSignIn}>
                    Sign in
                  </Button>
                ) : null}
                {authState.user ? (
                  <AccountPanel
                    initials={initials}
                    canAccessAdmin={canAccessAdmin}
                    onSignOut={handleSignOut}
                    authError={authError}
                  />
                ) : null}
              </div>
            </div>

            {authError ? <div className="container pb-3 text-xs text-destructive">{authError}</div> : null}
          </header>

          <main className="container relative z-10 flex-1 py-5">
            <Outlet />
          </main>

          <div className="container pb-4 text-center text-xs text-muted-foreground md:hidden">
            Browser only. Install not supported in this version.
          </div>
        </div>
      </div>
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
