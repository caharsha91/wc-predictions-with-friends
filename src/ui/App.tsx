import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import Layout from './Layout'
import AdminExportsPage from './pages/AdminExportsPage'
import AdminSimulationPage from './pages/AdminSimulationPage'
import AdminUsersPage from './pages/AdminUsersPage'
import AccessDeniedPage from './pages/AccessDeniedPage'
import BracketPage from './pages/BracketPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ResultsPage from './pages/ResultsPage'
import ThemeSelectorPage from './pages/ThemeSelectorPage'
import UpcomingMatchesPage from './pages/UpcomingMatchesPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useSimulationState } from './hooks/useSimulationState'
import { Card } from './components/ui/Card'

function AdminGate() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const simulation = useSimulationState()

  if (simulation.enabled) return <Outlet />
  if (authState.status === 'loading') {
    return (
      <Card>
        <h1 className="h1">Backstage</h1>
        <div className="pageSubtitle">Checking access...</div>
      </Card>
    )
  }
  if (user?.isAdmin) return <Outlet />
  return <AccessDeniedPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/upcoming" replace />} />
        <Route path="upcoming" element={<UpcomingMatchesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="bracket" element={<BracketPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="themes" element={<ThemeSelectorPage />} />
        <Route element={<AdminGate />}>
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="simulation" element={<AdminSimulationPage />} />
          <Route path="exports" element={<AdminExportsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
