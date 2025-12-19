import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="card">
      <h1 className="h1">World Cup Predictions</h1>
      <p className="muted">
        UI shell + local mock data. Next steps will add auth, picks, and scoring.
      </p>
      <div className="row">
        <Link className="button" to="/matches">
          Browse matches
        </Link>
        <Link className="button buttonSecondary" to="/leaderboard">
          View leaderboard
        </Link>
      </div>
    </div>
  )
}

