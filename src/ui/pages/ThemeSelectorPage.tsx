import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useSimulationState } from '../hooks/useSimulationState'
import { useTheme } from '../../theme/ThemeProvider'

export default function ThemeSelectorPage() {
  const { mode, isSystemMode, setMode, setSystemMode, syncNotice } = useTheme()
  const user = useCurrentUser()
  const simulation = useSimulationState()
  const canAccessAdmin = simulation.enabled || user?.isAdmin

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Settings</div>
        <h1 className="mt-3 text-2xl font-semibold uppercase tracking-[0.12em] text-foreground">
          Personalize your league view
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A ChatGPT-inspired take on the league hub: calm neutrals, crisp contrast, and a hint of green.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {syncNotice ? <Badge tone="success">Synced</Badge> : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Appearance</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em]">
              Color mode
            </div>
            <div className="text-xs text-muted-foreground">
              Choose light or dark, or let the system decide.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="pill"
              size="sm"
              data-active={!isSystemMode && mode === 'light' ? 'true' : 'false'}
              aria-pressed={!isSystemMode && mode === 'light'}
              onClick={() => setMode('light')}
            >
              Light
            </Button>
            <Button
              type="button"
              variant="pill"
              size="sm"
              data-active={!isSystemMode && mode === 'dark' ? 'true' : 'false'}
              aria-pressed={!isSystemMode && mode === 'dark'}
              onClick={() => setMode('dark')}
            >
              Dark
            </Button>
            <Button
              type="button"
              variant="pill"
              size="sm"
              data-active={isSystemMode ? 'true' : 'false'}
              aria-pressed={isSystemMode}
              onClick={() => setSystemMode(true)}
            >
              System
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">About</div>
          <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em]">
            Minimal, focused, and friendly
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            One league. Many opinions. One champion. Picks lock before kickoff, and the leaderboard
            refreshes daily from the offline pipeline.
          </p>
          <div className="mt-3 text-xs text-muted-foreground">
            Built for invite-only leagues with offline match updates and precomputed standings.
          </div>
        </div>
      </Card>

      {canAccessAdmin ? (
        <Card>
          <div className="px-4 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em]">
              League controls
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage member access and exports from here. Simulation tools stay local.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink to="/users" variant="secondary">
                Members
              </ButtonLink>
              <ButtonLink to="/exports" variant="secondary">
                Exports
              </ButtonLink>
              <ButtonLink to="/simulation" variant="secondary">
                Simulation
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
