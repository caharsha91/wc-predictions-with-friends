import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="card">
      <h1 className="h1">Not Found</h1>
      <p className="muted">That page doesn’t exist.</p>
      <Link className="button" to="/">
        Go home
      </Link>
    </div>
  )
}

