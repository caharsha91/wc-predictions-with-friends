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
    <div className="mx-auto flex min-h-[45vh] w-full max-w-xl items-center py-6">
      <Card className="w-full rounded-2xl border-border/60 p-6">
        <div className="space-y-3">
          <div className="v2-type-kicker v2-track-14">Invite-only</div>
          <h1 className="text-lg font-semibold text-foreground">
            Invite required
          </h1>
          <div className="text-sm text-muted-foreground">
            This league is invite-only. Ask a league admin to add your email. Taking you back to Play Center.
          </div>
          <ButtonLink to="/" variant="secondary">
            Back to Play Center
          </ButtonLink>
        </div>
      </Card>
    </div>
  )
}
