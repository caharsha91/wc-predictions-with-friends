import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import Layout from './Layout'
import AdminExportsPage from './pages/AdminExportsPage'
import AdminSimulationPage from './pages/AdminSimulationPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AccessDeniedPage from './pages/AccessDeniedPage'
import BracketPage from './pages/BracketPage'
import LeaderboardPage from './pages/LeaderboardPage'
import LandingPage from './pages/LandingPage'
import PicksPage from './pages/PicksPage'
import ThemeSelectorPage from './pages/ThemeSelectorPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useSimulationState } from './hooks/useSimulationState'
import { Card } from './components/ui/Card'
import { hasFirebase } from '../lib/firebase'

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
  const gridClasses = note ? 'grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start' : 'grid gap-4'
  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-4xl items-center py-6 md:min-h-[55vh]">
      <Card className="w-full rounded-3xl border border-border/60 bg-card p-7 shadow-card sm:p-9">
        <div className={gridClasses}>
          <div className="space-y-2">
            {kicker ? (
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {kicker}
              </div>
            ) : null}
            <div className="text-lg font-semibold text-foreground">{title}</div>
            {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          {note ? (
            <div className="rounded-2xl border border-border/60 bg-[var(--surface-muted)] p-4 text-xs text-muted-foreground">
              {note}
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

function AdminGate() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const simulation = useSimulationState()

  if (simulation.enabled) return <Outlet />
  if (authState.status === 'loading') {
    return (
      <GateCard
        kicker="Backstage"
        title="Checking access"
        subtitle="Verifying admin access..."
      />
    )
  }
  if (user?.isAdmin) return <Outlet />
  return <AccessDeniedPage />
}

function MemberGate() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const simulation = useSimulationState()

  if (!hasFirebase || simulation.enabled) return <Outlet />
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
        subtitle="Sign in with Google to access this league. Your email must be on the invite list."
        note="Use the Sign in button in the top bar to continue."
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

function LegacyPicksRedirect({ tab }: { tab: 'upcoming' | 'results' }) {
  const location = useLocation()
  const nextParams = new URLSearchParams(location.search)
  if (!nextParams.get('tab')) {
    nextParams.set('tab', tab)
  }
  const search = nextParams.toString()
  const target = search ? `/picks?${search}` : '/picks'
  return <Navigate to={target} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route element={<MemberGate />}>
          <Route path="picks" element={<PicksPage />} />
          <Route path="upcoming" element={<LegacyPicksRedirect tab="upcoming" />} />
          <Route path="results" element={<LegacyPicksRedirect tab="results" />} />
          <Route path="bracket" element={<BracketPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="settings" element={<ThemeSelectorPage />} />
          <Route path="themes" element={<Navigate to="/settings" replace />} />
          <Route element={<AdminGate />}>
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="simulation" element={<AdminSimulationPage />} />
            <Route path="exports" element={<AdminExportsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
