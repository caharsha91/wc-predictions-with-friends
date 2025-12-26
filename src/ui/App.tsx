import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './Layout'
import AdminPage from './pages/AdminPage'
import BracketPage from './pages/BracketPage'
import ExportsPage from './pages/ExportsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import ResultsPage from './pages/ResultsPage'
import UpcomingMatchesPage from './pages/UpcomingMatchesPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/upcoming" replace />} />
        <Route path="upcoming" element={<UpcomingMatchesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="bracket" element={<BracketPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="exports" element={<ExportsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
