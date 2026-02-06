import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import { useTheme } from '../../theme/ThemeProvider'

export default function ThemeSelectorPage() {
  const { mode, isSystemMode, setMode, setSystemMode, syncNotice } = useTheme()

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Settings"
        title="Account & Appearance"
        subtitle="Personal settings for this browser session and account."
        actions={syncNotice ? <Badge tone="success">Synced</Badge> : undefined}
      />

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Appearance</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
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

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Platform</div>
          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
            Browser-only experience
          </div>
          <p className="text-sm text-muted-foreground">
            This release is browser only. Install and native wrappers are not included.
          </p>
        </div>
      </Card>
    </div>
  )
}
