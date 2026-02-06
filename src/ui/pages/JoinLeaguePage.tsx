import { useParams } from 'react-router-dom'

import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function JoinLeaguePage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()

  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-2xl items-center py-6">
      <Card className="w-full rounded-2xl border-border/60 p-6">
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Invite</div>
          <h1 className="text-xl font-semibold uppercase tracking-[0.12em] text-foreground">Join league</h1>
          <div className="text-sm text-muted-foreground">
            Invite code: <span className="font-semibold text-foreground">{inviteCode || 'N/A'}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            This league uses email allowlisting. Sign in with Google, then ask an admin if access is still blocked.
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/login" variant="secondary">
              Go to login
            </ButtonLink>
            <ButtonLink to="/" variant="pill">
              Open app
            </ButtonLink>
          </div>
        </div>
      </Card>
    </div>
  )
}
