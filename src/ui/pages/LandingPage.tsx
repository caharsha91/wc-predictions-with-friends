import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="card heroCard">
      <div className="heroTag">Stadium Lights</div>
      <h1 className="h1 heroTitle">World Cup Predictions</h1>
      <p className="muted heroLead">
        Your private floodlit hub for fixtures, picks, and bragging rights.
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
