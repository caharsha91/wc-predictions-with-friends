import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
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
import FavoriteTeamSelectV2 from './components/v2/FavoriteTeamSelectV2'
import MemberAvatarV2 from './components/v2/MemberAvatarV2'
import { FavoriteTeamPreferenceProvider, useFavoriteTeamPreference } from './context/FavoriteTeamPreferenceContext'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useEasterEggs } from './hooks/useEasterEggs'
import { useRouteDataMode } from './hooks/useRouteDataMode'
import { useToast } from './hooks/useToast'
import { useViewerId } from './hooks/useViewerId'
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
import { resolvePersistableLastRoute } from './lib/lastRoute'
import { markMobileRootRedirectOptOut } from './lib/mobileRootRedirect'
import { writeUserProfile } from './lib/profilePersistence'
import { cn } from './lib/utils'
import { ADMIN_NAV, DEMO_ADMIN_NAV, DEMO_MAIN_NAV, MAIN_NAV, type NavItem } from './nav'

const APP_ROUTE_PREFIXES = [
  '/group-stage',
  '/match-picks',
  '/knockout-bracket',
  '/leaderboard',
  '/admin',
  '/demo/group-stage',
  '/demo/match-picks',
  '/demo/knockout-bracket',
  '/demo/leaderboard',
  '/demo/admin'
]

function isAppContentRoute(pathname: string) {
  if (pathname === '/' || pathname === '/demo') return true
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
        <div className="v2-type-kicker px-2 text-[var(--sidebar-nav-muted)]">
          {title}
        </div>
      )}
      <div className="grid gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.to} className="space-y-1">
              <NavLink
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
              {!compact && item.children?.length ? (
                <div className="ml-9 grid gap-1">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end={child.end}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md border px-2.5 py-1.5 text-xs font-medium transition',
                          isActive
                            ? 'border-[var(--sidebar-border)] bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-nav-foreground)]'
                            : 'border-transparent text-[var(--sidebar-nav-muted)] hover:border-[var(--sidebar-border)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--sidebar-nav-foreground)]'
                        )
                      }
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SidebarAccountMenu({
  name,
  favoriteTeamCode,
  favoriteTeamLoading,
  favoriteTeamSaving,
  onFavoriteTeamChange,
  onSignOut,
  onToggleDemoMode,
  canToggleDemoMode,
  isDemoMode,
  compact
}: {
  name: string
  favoriteTeamCode?: string | null
  favoriteTeamLoading: boolean
  favoriteTeamSaving: boolean
  onFavoriteTeamChange: (nextFavoriteTeamCode: string | null) => void
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
          <MemberAvatarV2 name={name} favoriteTeamCode={favoriteTeamCode} size="md" />
          {compact ? null : (
            <>
              <div className="flex-1 pr-2">
                <div className="break-words text-sm font-semibold leading-snug text-[var(--sidebar-nav-foreground)]">
                  {name}
                </div>
                {isDemoMode ? (
                  <div className="v2-type-chip v2-track-10 mt-1 inline-flex rounded-full border border-border bg-[var(--surface-muted)] px-2 py-0.5 uppercase text-foreground">
                    Demo
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-[var(--sidebar-nav-muted)]">•••</div>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="account-menu-content min-w-[260px] overflow-visible"
      >
        <div className="account-menu-favorite-section rounded-md p-2">
          <div className="account-menu-favorite-label v2-type-kicker mb-2 px-0.5 text-[var(--sidebar-nav-muted)]">
            Favorite team
          </div>
          <FavoriteTeamSelectV2
            value={favoriteTeamCode}
            disabled={favoriteTeamLoading}
            loading={favoriteTeamSaving}
            onChange={onFavoriteTeamChange}
            variant="sidebar"
            menuPlacement="top"
          />
        </div>
        <DropdownMenuSeparator className="account-menu-separator" />
        <DropdownMenuItem className="account-menu-item" onSelect={() => setMode('light')}>
          Theme: Light {!isSystemMode && mode === 'light' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem className="account-menu-item" onSelect={() => setMode('dark')}>
          Theme: Dark {!isSystemMode && mode === 'dark' ? '✓' : ''}
        </DropdownMenuItem>
        <DropdownMenuItem className="account-menu-item" onSelect={() => setSystemMode(true)}>
          Theme: System {isSystemMode ? '✓' : ''}
        </DropdownMenuItem>
        {canToggleDemoMode ? (
          <DropdownMenuItem className="account-menu-item" onSelect={() => void onToggleDemoMode()}>
            {isDemoMode ? 'Exit Demo Mode' : 'Enter Demo Mode'}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator className="account-menu-separator" />
        <DropdownMenuItem
          className="account-menu-item text-destructive hover:text-destructive focus-visible:text-destructive"
          onSelect={() => void onSignOut()}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function toDemoPath(pathname: string): string {
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return pathname
  if (pathname === '/') return '/demo'
  if (pathname === '/group-stage' || pathname.startsWith('/group-stage/')) return `/demo${pathname}`
  if (pathname === '/match-picks') return '/demo/match-picks'
  if (pathname === '/knockout-bracket') return '/demo/knockout-bracket'
  if (pathname === '/leaderboard') return '/demo/leaderboard'
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return `/demo${pathname}`

  return '/demo'
}

function toDefaultPath(pathname: string): string {
  if (pathname === '/demo') return '/'
  if (!pathname.startsWith('/demo/')) return pathname

  if (pathname === '/demo/group-stage' || pathname.startsWith('/demo/group-stage/')) {
    return pathname.replace('/demo/group-stage', '/group-stage')
  }
  if (pathname === '/demo/match-picks') return '/match-picks'
  if (pathname === '/demo/knockout-bracket') return '/knockout-bracket'
  if (pathname === '/demo/leaderboard') return '/leaderboard'
  if (pathname === '/demo/admin' || pathname.startsWith('/demo/admin/')) {
    return pathname.replace('/demo', '')
  }

  return '/'
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
    <div className="v2-type-kicker flex items-center justify-center gap-2 border-b border-[var(--ticker-border)] [background:var(--ticker-bg)] px-4 py-2 text-[var(--demo-banner-text)] backdrop-blur-sm">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      Demo Mode Active
    </div>
  )
}

function LayoutFrameContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const mode = useRouteDataMode()
  const user = useCurrentUser()
  const viewerId = useViewerId()
  const authState = useAuthState()
  const { showToast } = useToast()
  const canAccessAdmin = user?.isAdmin === true
  const routeSaveTimerRef = useRef<number | null>(null)
  const queuedRouteRef = useRef<string | null>(null)
  const persistedRouteRef = useRef<string | null>(null)
  const {
    sidebarCompact,
    focusHighlightActive,
    onLogoClick,
    onLogoPointerDown,
    onLogoPointerUp,
    onLogoPointerLeave,
    onLogoPointerCancel,
    onLastUpdatedTap
  } = useEasterEggs()
  const favoriteTeamPreference = useFavoriteTeamPreference()

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
    const emitDemoControlsChangedAfterNavigation = () => {
      if (typeof window === 'undefined') return
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
      }, 0)
    }

    if (isDemoRoute) {
      const nextPath = `${toDefaultPath(location.pathname)}${location.search}${location.hash}`
      navigate(nextPath, { replace: true })
      emitDemoControlsChangedAfterNavigation()
      return
    }

    await ensureDemoDefaults()
    const nextPath = `${toDemoPath(location.pathname)}${location.search}${location.hash}`
    navigate(nextPath, { replace: true })
    emitDemoControlsChangedAfterNavigation()
  }

  function handleMainClickCapture(event: MouseEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const lastUpdatedEl = target.closest('[data-v2-last-updated]')
    if (!lastUpdatedEl) return
    onLastUpdatedTap()
  }

  const appContentRoute = isAppContentRoute(location.pathname)
  const isDemoRoute = isDemoPath(location.pathname)
  const shellMainStyle: CSSProperties = {
    ['--v2-shell-top-offset' as string]: isDemoRoute ? '44px' : '8px'
  }
  const mainNavItems = isDemoRoute ? DEMO_MAIN_NAV : MAIN_NAV
  const adminNavItems = isDemoRoute ? DEMO_ADMIN_NAV : ADMIN_NAV

  useEffect(() => {
    if (!appContentRoute) return
    if (location.pathname === '/' || location.pathname === '/demo') return
    markMobileRootRedirectOptOut()
  }, [appContentRoute, location.pathname])

  useEffect(() => {
    queuedRouteRef.current = null
    persistedRouteRef.current = null
    if (routeSaveTimerRef.current !== null) {
      window.clearTimeout(routeSaveTimerRef.current)
      routeSaveTimerRef.current = null
    }
  }, [mode, viewerId, authState.user?.email])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flushQueuedRoute = (route: string) => {
      void writeUserProfile(mode, viewerId, { lastRoute: route }, authState.user?.email ?? null)
        .then(() => {
          persistedRouteRef.current = route
        })
        .catch(() => {
          // best effort persistence; never block UI
        })
    }

    const canPersistForUser = !(mode === 'default' && hasFirebase && (!authState.user || user?.isMember !== true))
    if (!viewerId || !canPersistForUser) return

    const nextRoute = resolvePersistableLastRoute(location.pathname, location.search, mode)
    if (!nextRoute) {
      const queuedRoute = queuedRouteRef.current
      if (queuedRoute && routeSaveTimerRef.current !== null) {
        window.clearTimeout(routeSaveTimerRef.current)
        routeSaveTimerRef.current = null
        queuedRouteRef.current = null
        flushQueuedRoute(queuedRoute)
      }
      return
    }

    if (nextRoute === persistedRouteRef.current || nextRoute === queuedRouteRef.current) return

    queuedRouteRef.current = nextRoute
    if (routeSaveTimerRef.current !== null) {
      window.clearTimeout(routeSaveTimerRef.current)
    }
    routeSaveTimerRef.current = window.setTimeout(() => {
      void writeUserProfile(mode, viewerId, { lastRoute: nextRoute }, authState.user?.email ?? null)
        .then(() => {
          persistedRouteRef.current = nextRoute
        })
        .catch(() => {
          // best effort persistence; never block UI
        })
        .finally(() => {
          if (queuedRouteRef.current === nextRoute) queuedRouteRef.current = null
        })
    }, 1200)
  }, [authState.user, location.pathname, location.search, mode, user?.isMember, viewerId])

  useEffect(() => {
    return () => {
      if (routeSaveTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(routeSaveTimerRef.current)
        routeSaveTimerRef.current = null
      }
    }
  }, [])

  return (
    <div
      className="v2-shell-root min-h-screen bg-background bg-[var(--shell-bg-overlay)] bg-no-repeat md:h-[100dvh] md:overflow-hidden"
      data-v2-focus-highlight={focusHighlightActive ? 'true' : 'false'}
    >
      <div
        data-testid="v2-shell-grid"
        className={cn(
          'v2-shell-grid min-h-screen md:grid md:h-[100dvh] md:overflow-hidden',
          sidebarCompact ? 'md:grid-cols-[96px_minmax(0,1fr)]' : 'md:grid-cols-[320px_minmax(0,1fr)]'
        )}
      >
        <aside
          data-testid="v2-shell-sidebar"
          className="v2-shell-sidebar hidden h-full flex-col border-r border-[var(--shell-sidebar-divider)] bg-[var(--sidebar-bg)] px-3 py-4 shadow-[var(--shadow1)] md:flex md:overflow-hidden"
        >
          <div className="space-y-3 px-1 pb-4">
            <BrandLogo
              size={sidebarCompact ? 'sm' : 'md'}
              variant={sidebarCompact ? 'mark' : 'full'}
              tone="inverse"
              markButtonProps={{
                className: 'v2-pop-target',
                onClick: onLogoClick,
                onPointerDown: onLogoPointerDown,
                onPointerUp: onLogoPointerUp,
                onPointerLeave: onLogoPointerLeave,
                onPointerCancel: onLogoPointerCancel
              }}
            />
          </div>

          <div className="flex-1 space-y-6 pr-1" aria-label="Primary">
            <SidebarNavSection title="Main" items={mainNavItems} compact={sidebarCompact} />
            {canAccessAdmin ? (
              <div className="space-y-3 border-t border-[var(--shell-sidebar-divider)] pt-4">
                {sidebarCompact ? null : (
                  <div className="v2-type-kicker px-2 text-[var(--sidebar-nav-muted)]/85">
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
                name={user?.name || authState.user.displayName || authState.user.email || 'Signed in'}
                favoriteTeamCode={favoriteTeamPreference.favoriteTeamCode}
                favoriteTeamLoading={favoriteTeamPreference.isLoading}
                favoriteTeamSaving={favoriteTeamPreference.isSaving}
                onFavoriteTeamChange={favoriteTeamPreference.setFavoriteTeamCode}
                onSignOut={handleSignOut}
                onToggleDemoMode={handleToggleDemoMode}
                canToggleDemoMode={canAccessAdmin}
                isDemoMode={isDemoRoute}
                compact={sidebarCompact}
              />
            ) : hasFirebase ? (
              <button
                className="v2-pop-target inline-flex h-9 w-full items-center justify-center rounded-full border border-[var(--primary-cta-border)] [background:var(--primary-cta-bg)] px-3 text-xs font-semibold text-primary-foreground shadow-[var(--primary-cta-shadow)] transition hover:[background:var(--primary-cta-hover-bg)] active:translate-y-[1px]"
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

        <div className="flex min-h-0 min-w-0 flex-col">
          {isDemoRoute ? <DemoBanner /> : null}
          <main
            data-testid="v2-shell-main"
            className={cn(
              'v2-shell-main relative z-10 flex-1 overflow-y-auto md:min-h-0',
              appContentRoute ? 'px-4 py-5 md:px-6 lg:px-8 xl:px-10' : 'container py-5'
            )}
            style={shellMainStyle}
            onClickCapture={handleMainClickCapture}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

function LayoutFrame() {
  return (
    <FavoriteTeamPreferenceProvider>
      <LayoutFrameContent />
    </FavoriteTeamPreferenceProvider>
  )
}

export default function Layout() {
  return <LayoutFrame />
}
