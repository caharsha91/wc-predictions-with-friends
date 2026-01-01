import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './Layout'
import AdminPage from './pages/AdminPage'
import AccessDeniedPage from './pages/AccessDeniedPage'
import BracketPage from './pages/BracketPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ResultsPage from './pages/ResultsPage'
import UpcomingMatchesPage from './pages/UpcomingMatchesPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAuthState } from './hooks/useAuthState'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useSimulationState } from './hooks/useSimulationState'

function AdminGate() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const simulation = useSimulationState()

  if (simulation.enabled) return <AdminPage />
  if (authState.status === 'loading') {
    return (
      <div className="card">
        <h1 className="h1">Admin</h1>
        <p className="muted">Checking access...</p>
      </div>
    )
  }
  if (user?.isAdmin) return <AdminPage />
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
        <Route path="exports" element={<Navigate to="/admin" replace />} />
        <Route path="admin" element={<AdminGate />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
