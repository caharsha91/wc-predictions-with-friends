import { Navigate } from 'react-router-dom'

import { hasFirebase } from '../../lib/firebase'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuthState } from '../hooks/useAuthState'

export default function LoginPage() {
  const authState = useAuthState()

  if (authState.user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-2xl items-center py-6">
      <Card className="w-full rounded-2xl border-border/60 p-6">
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private league</div>
          <h1 className="text-xl font-semibold uppercase tracking-[0.12em] text-foreground">Login</h1>
          {hasFirebase ? (
            <div className="text-sm text-muted-foreground">
              Use the <span className="font-semibold text-foreground">Sign in</span> button in the top bar to continue with Google.
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Firebase auth is not configured. The app is currently read-only in browser mode.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/" variant="secondary">
              Go to picks
            </ButtonLink>
            <ButtonLink to="/settings" variant="pill">
              Open settings
            </ButtonLink>
          </div>
        </div>
      </Card>
    </div>
  )
}
