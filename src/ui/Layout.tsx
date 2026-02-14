import { useEffect, type MouseEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import { fetchMatches, fetchMembers } from '../lib/data'
import { isDemoPath } from '../lib/dataMode'
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
import { useToast } from './hooks/useToast'
import {
  DEMO_SCENARIO_STORAGE_KEY,
  readDemoNowOverride,
  readDemoScenario,
  readDemoViewerId,
  writeDemoNowOverride,
  writeDemoScenario,
  writeDemoViewerId
} from './lib/demoControls'
import { clearDemoLocalStorage } from './lib/demoStorage'
import { cn } from './lib/utils'
import { ADMIN_NAV, DEMO_ADMIN_NAV, DEMO_MAIN_NAV, MAIN_NAV, type NavItem } from './nav'

const APP_ROUTE_PREFIXES = ['/play', '/admin', '/settings', '/demo/play', '/demo/admin']

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
  onToggleDemoMode,
  canToggleDemoMode,
  isDemoMode,
  compact
}: {
  initials: string
  name: string
  onSignOut: () => Promise<void>
  onToggleDemoMode: () => Promise<void>
  canToggleDemoMode: boolean
  isDemoMode: boolean
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
                {isDemoMode ? (
                  <div className="mt-1 inline-flex rounded-full border border-border bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-foreground">
                    Demo
                  </div>
                ) : null}
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
        {canToggleDemoMode ? (
          <DropdownMenuItem onSelect={() => void onToggleDemoMode()}>
            {isDemoMode ? 'Exit Demo Mode' : 'Enter Demo Mode'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive hover:text-destructive focus-visible:text-destructive"
          onSelect={() => void onSignOut()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function toDemoPath(pathname: string): string {
  if (pathname.startsWith('/demo/')) return pathname
  if (pathname === '/play') return '/demo/play'
  if (pathname.startsWith('/play/')) return pathname.replace('/play/', '/demo/play/')
  if (pathname === '/admin') return '/demo/admin'
  if (pathname.startsWith('/admin/')) return '/demo/admin'
  return '/demo/play'
}

function toDefaultPath(pathname: string): string {
  if (!pathname.startsWith('/demo/')) return pathname
  if (pathname === '/demo/play') return '/play'
  if (pathname.startsWith('/demo/play/')) return pathname.replace('/demo/play/', '/play/')
  if (pathname === '/demo/admin') return '/admin'
  if (pathname.startsWith('/demo/admin/')) return '/admin'
  return '/play'
}

async function ensureDemoDefaults(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!window.localStorage.getItem(DEMO_SCENARIO_STORAGE_KEY)) {
    writeDemoScenario('pre-group')
  }

  const scenario = readDemoScenario()
  try {
    const membersFile = await fetchMembers({ mode: 'demo' })
    const first = membersFile.members[0]
    const currentViewerId = readDemoViewerId()
    const hasCurrentViewer = currentViewerId
      ? membersFile.members.some((member) => member.id === currentViewerId)
      : false
    if (!hasCurrentViewer && first?.id) writeDemoViewerId(first.id)
  } catch {
    // no-op: keep fallback behavior
  }

  if (!readDemoNowOverride() && scenario === 'pre-group') {
    try {
      const matchesFile = await fetchMatches({ mode: 'demo' })
      const firstGroup = matchesFile.matches
        .filter((match) => match.stage === 'Group')
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())[0]
      if (firstGroup) {
        const nowOverride = new Date(new Date(firstGroup.kickoffUtc).getTime() - 2 * 60 * 60 * 1000)
        writeDemoNowOverride(nowOverride.toISOString())
      }
    } catch {
      writeDemoNowOverride(new Date().toISOString())
    }
  }
}

function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-[rgba(var(--warn-rgb),0.2)] bg-[rgba(var(--warn-rgb),0.1)] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[rgb(var(--warn-rgb))] backdrop-blur-sm">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--warn-rgb))]" />
      Demo Mode Active
    </div>
  )
}

function LayoutFrame() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useCurrentUser()
  const authState = useAuthState()
  const { showToast } = useToast()
  const canAccessAdmin = user?.isAdmin === true
  const {
    sidebarCompact,
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
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(firebaseAuth, provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      showToast({ title: 'Sign in failed', message, tone: 'danger' })
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return
    try {
      clearDemoLocalStorage()
      await signOut(firebaseAuth)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out.'
      showToast({ title: 'Sign out failed', message, tone: 'danger' })
    }
  }

  async function handleToggleDemoMode() {
    if (!canAccessAdmin) return
    if (isDemoRoute) {
      const nextPath = `${toDefaultPath(location.pathname)}${location.search}${location.hash}`
      navigate(nextPath, { replace: true })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
      }
      return
    }

    await ensureDemoDefaults()
    const nextPath = `${toDemoPath(location.pathname)}${location.search}${location.hash}`
    navigate(nextPath, { replace: true })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
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
  const isDemoRoute = isDemoPath(location.pathname)
  const mainNavItems = isDemoRoute ? DEMO_MAIN_NAV : MAIN_NAV
  const adminNavItems = isDemoRoute ? DEMO_ADMIN_NAV : ADMIN_NAV

  useEffect(() => {
    if (!isDemoRoute || typeof window === 'undefined') return

    const handleExit = () => {
      clearDemoLocalStorage()
    }

    window.addEventListener('beforeunload', handleExit)
    window.addEventListener('pagehide', handleExit)
    return () => {
      window.removeEventListener('beforeunload', handleExit)
      window.removeEventListener('pagehide', handleExit)
    }
  }, [isDemoRoute])

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
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Primary">
            <SidebarNavSection title="Main" items={mainNavItems} compact={sidebarCompact} />
            {canAccessAdmin ? (
              <div className="space-y-3 border-t border-[var(--shell-sidebar-divider)] pt-4">
                {sidebarCompact ? null : (
                  <div className="px-2 text-[10px] uppercase tracking-[0.3em] text-[var(--sidebar-nav-muted)]/80">
                    Admin tools
                  </div>
                )}
                <SidebarNavSection
                  title="Admin"
                  items={adminNavItems}
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
                onToggleDemoMode={handleToggleDemoMode}
                canToggleDemoMode={canAccessAdmin}
                isDemoMode={isDemoRoute}
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
          {isDemoRoute ? <DemoBanner /> : null}
          <main
            data-testid="app-shell-main"
            className={cn(
              'relative z-10 flex-1 overflow-y-auto',
              appContentRoute ? 'px-4 py-5 md:px-6 lg:px-8 xl:px-10' : 'container py-5'
            )}
            onClickCapture={handleMainClickCapture}
          >
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
