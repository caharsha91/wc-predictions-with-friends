import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { hasFirebase } from '../lib/firebase'
import { Card } from './components/ui/Card'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import Layout from './Layout'
import AccessDeniedPage from './pages/AccessDeniedPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

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
    return (
      <GateCard
        kicker="Private league"
        title="Sign in required"
        subtitle="Sign in with Google to access this league."
        note="Open Login and use Sign in with Google to continue."
      />
    )
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
  if (!user.isMember) return <AccessDeniedPage />
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="access-denied" element={<AccessDeniedPage />} />

        <Route element={<MemberGate />}>
          <Route index element={<RouteSuspense><LandingPage /></RouteSuspense>} />
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
