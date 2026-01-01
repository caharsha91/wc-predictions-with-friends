import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function NotFoundPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setTimeout(() => {
      navigate('/', { replace: true })
    }, 3000)
    return () => window.clearTimeout(id)
  }, [navigate])

  return (
    <Card>
      <h1 className="h1">Not Found</h1>
      <div className="pageSubtitle">That page does not exist. Redirecting home...</div>
      <ButtonLink to="/">
        Go to home
      </ButtonLink>
    </Card>
  )
}
