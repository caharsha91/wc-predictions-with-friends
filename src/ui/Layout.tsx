import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import { AppShellProvider, useAppShell } from './components/AppShellContext'
import {
  BracketIcon,
  HomeIcon,
  CalendarIcon,
  SettingsIcon,
  TrophyIcon
} from './components/Icons'
import { Badge } from './components/ui/Badge'
import { Button, ButtonLink } from './components/ui/Button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './components/ui/Sheet'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useSimulationState } from './hooks/useSimulationState'
import { cn } from './lib/utils'
import { firebaseAuth, hasFirebase } from '../lib/firebase'

const PAGE_TITLES: Record<string, string> = {
  home: 'Home',
  picks: 'Picks',
  upcoming: 'Picks',
  results: 'Picks',
  bracket: 'Bracket',
  leaderboard: 'Leaderboard',
  settings: 'Settings',
  users: 'Users',
  simulation: 'Simulation',
  exports: 'Exports'
}

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/picks', label: 'Picks', icon: CalendarIcon },
  { to: '/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  duration: number
  hue: number
  rotate: number
  fall: number
}

const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: 6 + Math.random() * 88,
  delay: Math.random() * 0.2,
  duration: 1.1 + Math.random() * 0.9,
  hue: Math.floor(Math.random() * 360),
  rotate: Math.random() * 360,
  fall: 70 + Math.random() * 40
}))

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

function LayoutFrame() {
  const user = useCurrentUser()
  const authState = useAuthState()
  const simulation = useSimulationState()
  const [authError, setAuthError] = useState<string | null>(null)
  const [confettiVisible, setConfettiVisible] = useState(false)
  const [confettiSeed, setConfettiSeed] = useState(0)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const logoClickCountRef = useRef(0)
  const logoClickTimerRef = useRef<number | null>(null)
  const confettiTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const creditsTimerRef = useRef<number | null>(null)
  const skipLogoClickRef = useRef(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const canAccessAdmin = simulation.enabled || user?.isAdmin
  const location = useLocation()
  const appShell = useAppShell()
  const topBarAction = appShell?.topBarAction ?? null
  const routeKey = location.pathname.split('/')[1] || 'home'
  const pageTitle = PAGE_TITLES[routeKey] ?? 'WC Predictions'
  const navItems = NAV_ITEMS

  useEffect(() => {
    return () => {
      if (logoClickTimerRef.current) {
        window.clearTimeout(logoClickTimerRef.current)
      }
      if (confettiTimerRef.current) {
        window.clearTimeout(confettiTimerRef.current)
      }
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current)
      }
      if (creditsTimerRef.current) {
        window.clearTimeout(creditsTimerRef.current)
      }
    }
  }, [])

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

  function resetLogoClickTimer() {
    if (!logoClickTimerRef.current) return
    window.clearTimeout(logoClickTimerRef.current)
    logoClickTimerRef.current = null
  }

  function triggerNerdEasterEgg() {
    triggerConfetti()
    showToast('Respectfully, you are a nerd.')
  }

  function triggerConfetti() {
    setConfettiSeed((current) => current + 1)
    setConfettiVisible(true)
    if (confettiTimerRef.current) {
      window.clearTimeout(confettiTimerRef.current)
    }
    confettiTimerRef.current = window.setTimeout(() => {
      setConfettiVisible(false)
      confettiTimerRef.current = null
    }, 1800)
  }

  function handleLogoClick() {
    if (skipLogoClickRef.current) {
      skipLogoClickRef.current = false
      return
    }
    resetLogoClickTimer()
    logoClickCountRef.current += 1
    if (logoClickCountRef.current >= 7) {
      logoClickCountRef.current = 0
      triggerNerdEasterEgg()
      return
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0
      logoClickTimerRef.current = null
    }, 2500)
  }

  function showToast(message: string) {
    setToastMessage(message)
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null)
      toastTimerRef.current = null
    }, 2600)
  }

  function handleLogoPressStart() {
    if (creditsTimerRef.current) {
      window.clearTimeout(creditsTimerRef.current)
    }
    creditsTimerRef.current = window.setTimeout(() => {
      skipLogoClickRef.current = true
      triggerConfetti()
      showToast('Vibe coded by caharsha91.')
      if (creditsTimerRef.current) {
        window.clearTimeout(creditsTimerRef.current)
        creditsTimerRef.current = null
      }
    }, 2000)
  }

  function handleLogoPressEnd() {
    if (!creditsTimerRef.current) return
    window.clearTimeout(creditsTimerRef.current)
    creditsTimerRef.current = null
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

  const initials = getInitials(user?.name, user?.email)

  return (
    <div className="min-h-screen pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] min-[901px]:pb-0">
      {simulation.enabled ? (
        <div className="bg-[var(--ticker-bg)] px-3 py-2 text-center text-[11px] uppercase tracking-[0.35em] text-foreground">
          Simulation mode (local only)
        </div>
      ) : null}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-border/60 bg-[var(--header-bg)] backdrop-blur"
      >
        <div className="container flex items-center justify-between gap-3 py-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--brand-mark-bg)] text-sm font-semibold uppercase tracking-[0.2em] text-[var(--brand-mark-text)] shadow-soft drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)] font-display"
            type="button"
            aria-label="Toggle Easter egg"
            onClick={handleLogoClick}
            onPointerDown={handleLogoPressStart}
            onPointerUp={handleLogoPressEnd}
            onPointerLeave={handleLogoPressEnd}
            onPointerCancel={handleLogoPressEnd}
          >
            WC
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{pageTitle}</span>
            <span className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
              World Cup Predictions
            </span>
          </div>
          <div className="flex items-center gap-2">
            {topBarAction ? <div>{topBarAction}</div> : null}
            {hasFirebase && !simulation.enabled && !authState.user ? (
              <Button size="sm" type="button" onClick={handleSignIn}>
                Sign in
              </Button>
            ) : null}
            {authState.user ? (
              <Sheet>
                <SheetTrigger asChild>
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[var(--surface-muted)] text-xs font-semibold uppercase text-foreground"
                    type="button"
                    aria-label="Open user settings"
                  >
                    {initials}
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[92vw] max-w-sm">
                  <SheetHeader>
                    <SheetTitle>Account</SheetTitle>
                    <SheetDescription>Invite-only league controls.</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-4 px-4">
                    <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] p-3">
                      <div className="text-sm font-semibold text-foreground">
                        {user?.name || authState.user.displayName || 'Signed in'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {user?.email || authState.user.email || 'No email on file'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {user?.isAdmin ? <Badge tone="info">Admin</Badge> : null}
                        {user ? (
                          user.isMember ? (
                            <Badge>Member</Badge>
                          ) : (
                            <Badge tone="warning">Not allowlisted</Badge>
                          )
                        ) : (
                          <Badge tone="info">Checking access</Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <ButtonLink to="/settings" variant="secondary">
                        Settings
                      </ButtonLink>
                      {canAccessAdmin ? (
                        <ButtonLink to="/users" variant="secondary">
                          Manage members
                        </ButtonLink>
                      ) : null}
                    </div>
                    {user && !user.isMember ? (
                      <div className="rounded-lg border border-[var(--border-warning)] bg-[var(--banner-accent)] p-3 text-xs text-foreground">
                        This league is invite-only. Ask an admin to add your email.
                      </div>
                    ) : null}
                  </div>
                  <SheetFooter className="flex items-center justify-between gap-2">
                    <Button variant="ghost" onClick={handleSignOut}>
                      Sign out
                    </Button>
                    <ButtonLink to="/settings" variant="primary">
                      View settings
                    </ButtonLink>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            ) : null}
          </div>
        </div>
        {authError ? (
          <div className="container pb-3 text-xs text-destructive">{authError}</div>
        ) : null}
        <div className="hidden min-[901px]:block border-t border-border/60">
          <nav className="container flex flex-wrap items-center gap-2 py-2" aria-label="Primary">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition',
                      isActive
                        ? 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                    )
                  }
                  end={item.to === '/'}
                >
                  <span className="text-sm">
                    <Icon />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="container relative z-10 flex-1 py-5">
        <Outlet />
      </main>

      {confettiVisible ? (
        <div className="confettiBurst" aria-hidden="true" key={confettiSeed}>
          {CONFETTI_PIECES.map((piece) => (
            <span
              key={piece.id}
              className="confettiPiece"
              style={
                {
                  '--confetti-left': `${piece.left}%`,
                  '--confetti-delay': `${piece.delay}s`,
                  '--confetti-duration': `${piece.duration}s`,
                  '--confetti-hue': piece.hue,
                  '--confetti-rotate': `${piece.rotate}deg`,
                  '--confetti-fall': `${piece.fall}vh`
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
      {toastMessage ? (
        <div
          className="fixed bottom-[calc(var(--bottom-nav-height)+1.5rem+env(safe-area-inset-bottom))] right-5 z-50 rounded-full border border-border bg-card px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground shadow-soft min-[901px]:bottom-6"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-[var(--header-bg)] backdrop-blur min-[901px]:hidden"
        aria-label="Primary"
      >
        <div className="container flex items-center justify-between gap-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.2em]',
                    isActive
                      ? 'bg-[var(--accent-soft)] text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )
                }
                end={item.to === '/'}
              >
                <span className="text-base">
                  <Icon />
                </span>
                <span>{item.label}</span>
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
