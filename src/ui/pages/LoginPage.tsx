import { Navigate } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

import { firebaseAuth, hasFirebase } from '../../lib/firebase'
import { useState } from 'react'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuthState } from '../hooks/useAuthState'

export default function LoginPage() {
  const authState = useAuthState()
  const [authError, setAuthError] = useState<string | null>(null)

  if (authState.user) {
    return <Navigate to="/" replace />
  }

  async function handleSignIn() {
    if (!firebaseAuth) return
    setAuthError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(firebaseAuth, provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      setAuthError(message)
    }
  }

  return (
    <div className="mx-auto flex min-h-[45vh] w-full max-w-2xl items-center py-6">
      <Card className="w-full rounded-2xl border-border/60 p-6">
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Private league</div>
          <h1 className="text-xl font-semibold uppercase tracking-[0.12em] text-foreground">Login</h1>
          {hasFirebase ? (
            <div className="text-sm text-muted-foreground">
              Sign in with Google to access your private league.
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Firebase auth is not configured. The app is currently read-only in browser mode.
            </div>
          )}
          {authError ? <div className="text-xs text-destructive">{authError}</div> : null}
          <div className="flex flex-wrap gap-2">
            {hasFirebase ? (
              <Button type="button" onClick={() => void handleSignIn()}>
                Sign in with Google
              </Button>
            ) : null}
            <ButtonLink to="/" variant="secondary">
              Go to picks
            </ButtonLink>
          </div>
        </div>
      </Card>
    </div>
  )
}
