import type { ReactNode } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'

import { hasFirebase } from '../lib/firebase'
import { Card } from './components/ui/Card'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import Layout from './Layout'
import AccessDeniedPage from './pages/AccessDeniedPage'
import AdminUsersPage from './pages/AdminUsersPage'
import BracketPage from './pages/BracketPage'
import JoinLeaguePage from './pages/JoinLeaguePage'
import LeaderboardPage from './pages/LeaderboardPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import PicksPage from './pages/PicksPage'
import PicksWizardPage from './pages/PicksWizardPage'
import ResultsPage from './pages/ResultsPage'
import ThemeSelectorPage from './pages/ThemeSelectorPage'

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
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{kicker}</div>
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="join/:inviteCode" element={<JoinLeaguePage />} />
        <Route path="access-denied" element={<AccessDeniedPage />} />

        <Route element={<MemberGate />}>
          <Route index element={<PicksPage />} />
          <Route path="picks" element={<PicksPage />} />
          <Route path="picks/wizard" element={<PicksWizardPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="bracket" element={<BracketPage />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="settings" element={<ThemeSelectorPage />} />

          <Route element={<AdminGate />}>
            <Route path="players" element={<AdminUsersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
