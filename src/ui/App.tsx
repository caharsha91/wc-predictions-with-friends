import { Route, Routes } from 'react-router-dom'

import Layout from './Layout'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import LeaderboardPage from './pages/LeaderboardPage'
import ResultsPage from './pages/ResultsPage'
import UpcomingMatchesPage from './pages/UpcomingMatchesPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="upcoming" element={<UpcomingMatchesPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
