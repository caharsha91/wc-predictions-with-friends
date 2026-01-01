import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function AccessDeniedPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setTimeout(() => {
      navigate('/upcoming', { replace: true })
    }, 3000)
    return () => window.clearTimeout(id)
  }, [navigate])

  return (
    <div className="card">
      <h1 className="h1">Access denied</h1>
      <p className="muted">
        You do not have access to that page. Redirecting to Upcoming...
      </p>
      <Link className="button" to="/upcoming">
        Go to upcoming
      </Link>
    </div>
  )
}
