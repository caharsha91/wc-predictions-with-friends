import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'

import { firebaseAuth, hasFirebase } from '../../../lib/firebase'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuthState } from '../../hooks/useAuthState'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useToast } from '../../hooks/useToast'
import { isMobileUserAgent } from '../../lib/mobileRootRedirect'

function MobileAuthShell({
  title,
  subtitle,
  children
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="companion-auth-shell mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <Card className="companion-auth-card w-full rounded-3xl border-border/70 p-6">
        <div className="space-y-4">
          <div className="v2-type-kicker v2-track-14">Companion</div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </Card>
    </div>
  )
}

export function CompanionLoginPage() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const { showToast } = useToast()

  if (authState.user && user?.isMember) return <Navigate to="/m" replace />
  if (authState.user && user && !user.isMember) return <Navigate to="/m/access-denied" replace />

  async function handleSignIn() {
    if (!firebaseAuth) return
    try {
      const provider = new GoogleAuthProvider()
      if (isMobileUserAgent()) {
        await signInWithRedirect(firebaseAuth, provider)
      } else {
        await signInWithPopup(firebaseAuth, provider)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      showToast({ title: 'Sign in failed', message, tone: 'danger' })
    }
  }

  return (
    <MobileAuthShell
      title="Sign in"
      subtitle="Sign in with Google to open your private league companion."
    >
      {hasFirebase ? (
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => void handleSignIn()}>
            Continue with Google
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button type="button" disabled>
            Continue with Google
          </Button>
          <div className="text-sm text-muted-foreground">
            Firebase auth is not configured. Sign-in is unavailable in this environment.
          </div>
        </div>
      )}
    </MobileAuthShell>
  )
}

export function CompanionAccessDeniedPage() {
  const authState = useAuthState()
  const user = useCurrentUser()
  const { showToast } = useToast()

  if (!authState.user) return <Navigate to="/m/login" replace />
  if (user?.isMember) return <Navigate to="/m" replace />

  async function handleSwitchAccount() {
    if (!firebaseAuth) return
    try {
      await signOut(firebaseAuth)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to switch account right now.'
      showToast({ title: 'Sign out failed', message, tone: 'danger' })
    }
  }

  return (
    <MobileAuthShell
      title="Access denied"
      subtitle="This league is invite-only. Ask an admin to add your Google account email."
    >
      <div className="flex flex-col gap-2">
        <Button type="button" onClick={() => void handleSwitchAccount()}>
          Switch Google account
        </Button>
        <ButtonLink to="/m/login" variant="secondary">Back to sign in</ButtonLink>
      </div>
    </MobileAuthShell>
  )
}
