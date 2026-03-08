import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { hasFirebase } from '../lib/firebase'
import { Card } from './components/ui/Card'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import MobileCompanionLayout from './components/mobile/MobileCompanionLayout'
import {
  companionFeatureFlags,
  isCompanionAreaEnabled,
  isCompanionDeniedPath,
  isCompanionPath,
  isCompanionPublicPath,
  resolveCompanionFallbackPath
} from './lib/companionSurface'
import {
  isMobileUserAgent,
  readMobileRootRedirectOptOut,
  shouldAutoRedirectToCompanionFromRoot
} from './lib/mobileRootRedirect'
import Layout from './Layout'
import AccessDeniedPage from './pages/AccessDeniedPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import {
  CompanionHomePage,
  CompanionLeaderboardPage,
  CompanionPicksPage
} from './pages/mobile/CompanionPages'
import { CompanionAccessDeniedPage, CompanionLoginPage } from './pages/mobile/CompanionAuthPages'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const GroupStagePage = lazy(() => import('./pages/GroupStagePage'))
const GroupStageEntryPage = lazy(() => import('./pages/GroupStageEntryPage'))
const PicksPage = lazy(() => import('./pages/PicksPage'))
const BracketPage = lazy(() => import('./pages/BracketPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage'))
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'))
const AdminExportsPage = lazy(() => import('./pages/AdminExportsPage'))
const DemoControlsPage = lazy(() => import('./pages/DemoControlsPage'))

function GateCard({
  kicker,
  title,
  subtitle,
  note
}: {
  kicker?: string
  title: string
  subtitle?: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-4xl items-center py-6 md:min-h-[55vh]">
      <Card className="w-full rounded-3xl border border-border/60 bg-card p-7 shadow-card sm:p-9">
        <div className={note ? 'grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start' : 'grid gap-4'}>
          <div className="space-y-2">
            {kicker ? (
              <div className="v2-type-kicker v2-track-14">{kicker}</div>
            ) : null}
            <div className="text-lg font-semibold text-foreground">{title}</div>
            {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {note ? (
            <div className="text-xs leading-relaxed text-muted-foreground md:justify-self-end md:text-right">{note}</div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

function RouteFallback() {
  return (
    <GateCard
      kicker="Private league"
      title="Loading view"
      subtitle="Preparing your latest snapshot view..."
    />
  )
}

function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

function MemberGate() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const location = useLocation()
  const shouldUseCompanionAuth = isCompanionPath(location.pathname) || (companionFeatureFlags.enabled && isMobileUserAgent())

  if (!hasFirebase) return <Outlet />
  if (authState.status === 'loading') {
    return (
      <GateCard
        kicker="Private league"
        title="Checking access"
        subtitle="Verifying invite-only membership..."
      />
    )
  }
  if (!authState.user) {
    return <Navigate to={shouldUseCompanionAuth ? '/m/login' : '/login'} replace />
  }
  if (!user) {
    return (
      <GateCard
        kicker="Private league"
        title="Checking membership"
        subtitle="Loading your access rights..."
      />
    )
  }
  if (!user.isMember) return <Navigate to={shouldUseCompanionAuth ? '/m/access-denied' : '/access-denied'} replace />
  return <Outlet />
}

function AdminGate() {
  const authState = useAuthState()
  const user = useCurrentUser()

  if (hasFirebase && authState.status === 'loading') {
    return (
      <GateCard
        kicker="Admin"
        title="Checking access"
        subtitle="Verifying admin access..."
      />
    )
  }

  if (!user) {
    return (
      <GateCard
        kicker="Admin"
        title="Checking access"
        subtitle="Loading your permissions..."
      />
    )
  }

  if (user.isAdmin) return <Outlet />
  return <AccessDeniedPage />
}

function DemoAdminGate() {
  const authState = useAuthState()
  const user = useCurrentUser()

  if (hasFirebase && authState.status === 'loading') {
    return (
      <GateCard
        kicker="Demo"
        title="Checking access"
        subtitle="Verifying demo access..."
      />
    )
  }

  if (!user) {
    return (
      <GateCard
        kicker="Demo"
        title="Checking access"
        subtitle="Loading your permissions..."
      />
    )
  }

  if (user.isAdmin) return <Outlet />
  return <Navigate to="/" replace />
}

function CompanionSurfaceGate() {
  const location = useLocation()

  if (!companionFeatureFlags.enabled) {
    return <Navigate to="/" replace />
  }

  if (isCompanionPath(location.pathname) && isCompanionPublicPath(location.pathname)) {
    return <Outlet />
  }

  if (isCompanionPath(location.pathname) && isCompanionDeniedPath(location.pathname)) {
    return <Navigate to={resolveCompanionFallbackPath(location.pathname)} replace />
  }

  if (isCompanionPath(location.pathname) && !isCompanionAreaEnabled(location.pathname)) {
    return <Navigate to="/m" replace />
  }

  return <Outlet />
}

function MemberRootRoute() {
  const location = useLocation()
  const shouldRedirectToCompanion = shouldAutoRedirectToCompanionFromRoot({
    pathname: location.pathname,
    companionEnabled: companionFeatureFlags.enabled,
    optedOut: readMobileRootRedirectOptOut()
  })

  if (shouldRedirectToCompanion) return <Navigate to="/m" replace />
  return <RouteSuspense><LandingPage /></RouteSuspense>
}

export default function App() {
  return (
    <Routes>
      <Route path="/m" element={<CompanionSurfaceGate />}>
        <Route path="login" element={<CompanionLoginPage />} />
        <Route path="access-denied" element={<CompanionAccessDeniedPage />} />
        <Route element={<MemberGate />}>
          <Route element={<MobileCompanionLayout />}>
            <Route index element={<CompanionHomePage />} />
            <Route path="picks" element={<CompanionPicksPage />} />
            <Route path="predictions" element={<Navigate to="/m" replace />} />
            <Route path="leaderboard" element={<CompanionLeaderboardPage />} />
            <Route path="matches" element={<Navigate to="/m" replace />} />
            <Route path="profile" element={<Navigate to="/m" replace />} />
            <Route path="admin/*" element={<Navigate to="/m" replace />} />
            <Route path="demo/*" element={<Navigate to="/m" replace />} />
            <Route path="group-stage/*" element={<Navigate to="/m" replace />} />
            <Route path="match-picks" element={<Navigate to="/m/picks" replace />} />
            <Route path="knockout-bracket" element={<Navigate to="/m" replace />} />
            <Route path="*" element={<Navigate to="/m" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="access-denied" element={<AccessDeniedPage />} />

        <Route element={<MemberGate />}>
          <Route index element={<MemberRootRoute />} />
          <Route path="group-stage/:groupId" element={<RouteSuspense><GroupStagePage /></RouteSuspense>} />
          <Route path="group-stage" element={<RouteSuspense><GroupStageEntryPage /></RouteSuspense>} />
          <Route path="match-picks" element={<RouteSuspense><PicksPage /></RouteSuspense>} />
          <Route path="knockout-bracket" element={<RouteSuspense><BracketPage /></RouteSuspense>} />
          <Route path="leaderboard" element={<RouteSuspense><LeaderboardPage /></RouteSuspense>} />

          <Route element={<AdminGate />}>
            <Route path="admin" element={<RouteSuspense><AdminConsolePage /></RouteSuspense>} />
            <Route path="admin/players" element={<RouteSuspense><AdminUsersPage /></RouteSuspense>} />
            <Route path="admin/exports" element={<RouteSuspense><AdminExportsPage /></RouteSuspense>} />
            <Route path="admin/controls" element={<RouteSuspense><DemoControlsPage /></RouteSuspense>} />
          </Route>
        </Route>

        <Route path="demo" element={<DemoAdminGate />}>
          <Route index element={<RouteSuspense><LandingPage /></RouteSuspense>} />
          <Route path="group-stage/:groupId" element={<RouteSuspense><GroupStagePage /></RouteSuspense>} />
          <Route path="group-stage" element={<RouteSuspense><GroupStageEntryPage /></RouteSuspense>} />
          <Route path="match-picks" element={<RouteSuspense><PicksPage /></RouteSuspense>} />
          <Route path="knockout-bracket" element={<RouteSuspense><BracketPage /></RouteSuspense>} />
          <Route path="leaderboard" element={<RouteSuspense><LeaderboardPage /></RouteSuspense>} />
          <Route path="admin" element={<RouteSuspense><AdminConsolePage /></RouteSuspense>} />
          <Route path="admin/players" element={<RouteSuspense><AdminUsersPage /></RouteSuspense>} />
          <Route path="admin/exports" element={<RouteSuspense><AdminExportsPage /></RouteSuspense>} />
          <Route path="admin/controls" element={<RouteSuspense><DemoControlsPage /></RouteSuspense>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
