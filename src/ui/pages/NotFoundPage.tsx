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
    <div className="mx-auto flex min-h-[45vh] w-full max-w-xl items-center py-6">
      <Card className="w-full rounded-2xl border-border/60 p-6">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Lost in extra time
          </div>
          <h1 className="text-lg font-semibold uppercase tracking-[0.12em] text-foreground">
            Page not found
          </h1>
          <div className="text-sm text-muted-foreground">
            That page does not exist. Redirecting home...
          </div>
          <ButtonLink to="/" variant="secondary">
            Go to home
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}
