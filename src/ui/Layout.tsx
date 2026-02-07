import { useState, type MouseEvent } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import { firebaseAuth, hasFirebase } from '../lib/firebase'
import { useTheme } from '../theme/ThemeProvider'
import BrandLogo from './components/BrandLogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './components/ui/DropdownMenu'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useEasterEggs } from './hooks/useEasterEggs'
import { cn } from './lib/utils'
import { ADMIN_NAV, MAIN_NAV, type NavItem } from './nav'

const APP_ROUTE_PREFIXES = ['/picks', '/results', '/bracket', '/leaderboard', '/players', '/exports']

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

function isAppContentRoute(pathname: string) {
  if (pathname === '/') return true
  return APP_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function SidebarNavSection({
  title,
  items,
  compact,
  hideTitle = false
}: {
  title: string
  items: NavItem[]
  compact: boolean
  hideTitle?: boolean
}) {
  return (
    <div className="space-y-2" aria-label={title}>
      {compact || hideTitle ? null : (
        <div className="px-2 text-[11px] uppercase tracking-[0.28em] text-[var(--sidebar-nav-muted)]">
          {title}
        </div>
      )}
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
                  'flex items-center gap-3 rounded-xl border text-sm font-semibold transition',
                  compact ? 'justify-center px-2 py-2.5' : 'px-3 py-2',
                  isActive
                    ? 'border-[var(--sidebar-border)] bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-nav-foreground)]'
                    : 'border-transparent text-[var(--sidebar-nav-muted)] hover:border-[var(--sidebar-border)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--sidebar-nav-foreground)]'
                )
              }
              aria-label={item.label}
            >
              <Icon size={16} />
              <span className={compact ? 'sr-only' : undefined}>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

function SidebarAccountMenu({
  initials,
  name,
  onSignOut,
  authError,
  compact
}: {
  initials: string
  name: string
  onSignOut: () => Promise<void>
  authError: string | null
  compact: boolean
}) {
  const { mode, isSystemMode, setMode, setSystemMode } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-nav-hover-bg)] text-left transition hover:border-[var(--sidebar-border)] hover:bg-[var(--sidebar-nav-active-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            compact
              ? 'flex h-12 w-full items-center justify-center px-2'
              : 'flex min-h-14 w-full items-center gap-3 p-3'
          )}
          type="button"
          aria-label="Open account menu"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-[var(--surface-muted)] text-xs font-semibold uppercase text-foreground">
            {initials}
          </div>
          {compact ? null : (
            <>
              <div className="flex-1 pr-2">
                <div className="break-words text-sm font-semibold leading-snug text-[var(--sidebar-nav-foreground)]">
                  {name}
                </div>
              </div>
              <div className="text-xs text-[var(--sidebar-nav-muted)]">•••</div>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-[220px]">
        <DropdownMenuItem onSelect={() => setMode('light')}>
          Theme: Light {!isSystemMode && mode === 'light' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMode('dark')}>
          Theme: Dark {!isSystemMode && mode === 'dark' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setSystemMode(true)}>
          Theme: System {isSystemMode ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive hover:text-destructive focus-visible:text-destructive"
          onSelect={() => void onSignOut()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
      {authError ? <div className="px-1 pt-2 text-[11px] text-destructive">{authError}</div> : null}
    </DropdownMenu>
  )
}

function LayoutFrame() {
  const location = useLocation()
  const user = useCurrentUser()
  const authState = useAuthState()
  const [authError, setAuthError] = useState<string | null>(null)
  const canAccessAdmin = user?.isAdmin === true
  const {
    sidebarCompact,
    notice,
    popHighlightActive,
    onLogoClick,
    onLogoPointerDown,
    onLogoPointerUp,
    onLogoPointerLeave,
    onLogoPointerCancel,
    onLastUpdatedTap
  } = useEasterEggs()

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

  function handleMainClickCapture(event: MouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const lastUpdatedEl = target.closest('[data-last-updated]')
    if (!lastUpdatedEl) return
    onLastUpdatedTap()
  }

  const initials = getInitials(user?.name, user?.email)
  const appContentRoute = isAppContentRoute(location.pathname)

  return (
    <div
      className="min-h-screen bg-background bg-[var(--shell-bg-overlay)] bg-no-repeat"
      data-pop-highlight={popHighlightActive ? 'true' : 'false'}
    >
      <div
        data-testid="app-shell-grid"
        className={cn(
          'min-h-screen md:grid md:h-screen md:overflow-hidden',
          sidebarCompact ? 'md:grid-cols-[96px_minmax(0,1fr)]' : 'md:grid-cols-[320px_minmax(0,1fr)]'
        )}
      >
        <aside
          data-testid="app-shell-sidebar"
          className="hidden min-h-screen flex-col border-r border-[var(--shell-sidebar-divider)] bg-[var(--sidebar-bg)] px-3 py-4 shadow-[var(--shadow1)] md:flex md:h-screen"
        >
          <div className="space-y-3 px-1 pb-4">
            <BrandLogo
              size={sidebarCompact ? 'sm' : 'md'}
              variant={sidebarCompact ? 'mark' : 'full'}
              tone="inverse"
              markButtonProps={{
                className: 'egg-pop-target',
                onClick: onLogoClick,
                onPointerDown: onLogoPointerDown,
                onPointerUp: onLogoPointerUp,
                onPointerLeave: onLogoPointerLeave,
                onPointerCancel: onLogoPointerCancel
              }}
            />
            {notice ? (
              <div
                className={cn(
                  'rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-nav-hover-bg)] px-2 py-1 text-[11px] text-[var(--sidebar-nav-foreground)]',
                  sidebarCompact && 'text-center'
                )}
              >
                {notice}
              </div>
            ) : null}
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Primary">
            <SidebarNavSection title="Main" items={MAIN_NAV} compact={sidebarCompact} />
            {canAccessAdmin ? (
              <div className="space-y-3 border-t border-[var(--shell-sidebar-divider)] pt-4">
                {sidebarCompact ? null : (
                  <div className="px-2 text-[10px] uppercase tracking-[0.3em] text-[var(--sidebar-nav-muted)]/80">
                    Admin tools
                  </div>
                )}
                <SidebarNavSection
                  title="Admin"
                  items={ADMIN_NAV}
                  compact={sidebarCompact}
                  hideTitle
                />
              </div>
            ) : null}
          </div>

          <div className="mt-4 shrink-0 space-y-3 border-t border-[var(--shell-sidebar-divider)] pt-3">
            {authState.user ? (
              <SidebarAccountMenu
                initials={initials}
                name={user?.name || authState.user.displayName || authState.user.email || 'Signed in'}
                onSignOut={handleSignOut}
                authError={authError}
                compact={sidebarCompact}
              />
            ) : hasFirebase ? (
              <button
                className="egg-pop-target inline-flex h-9 w-full items-center justify-center rounded-full border border-[var(--primary-cta-border)] [background:var(--primary-cta-bg)] px-3 text-xs font-semibold text-primary-foreground shadow-[var(--primary-cta-shadow)] transition hover:[background:var(--primary-cta-hover-bg)] active:translate-y-[1px]"
                type="button"
                onClick={() => void handleSignIn()}
              >
                Sign in
              </button>
            ) : (
              <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--sidebar-nav-hover-bg)] px-3 py-2 text-sm text-[var(--sidebar-nav-foreground)]">
                Guest
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col md:h-screen md:overflow-hidden">
          <main
            data-testid="app-shell-main"
            className={cn(
              'relative z-10 flex-1 overflow-y-auto',
              appContentRoute ? 'px-4 py-5 md:px-6 lg:px-8 xl:px-10' : 'container py-5'
            )}
            onClickCapture={handleMainClickCapture}
          >
            {authError ? <div className="mb-4 text-xs text-destructive">{authError}</div> : null}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  return <LayoutFrame />
}
