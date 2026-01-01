import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function AccessDeniedPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setTimeout(() => {
      navigate('/', { replace: true })
    }, 3000)
    return () => window.clearTimeout(id)
  }, [navigate])

  return (
    <Card>
      <h1 className="h1">Access denied</h1>
      <div className="pageSubtitle">
        You do not have access to that page. Redirecting home...
      </div>
      <ButtonLink to="/">
        Go to home
      </ButtonLink>
    </Card>
  )
}
