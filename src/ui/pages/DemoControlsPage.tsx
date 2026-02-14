import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { fetchMatches, fetchMembers } from '../../lib/data'
import type { Match } from '../../types/matches'
import type { Member } from '../../types/members'
import ConfirmationModal from '../components/ConfirmationModal'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Progress from '../components/ui/Progress'
import {
  DEMO_SCENARIO_OPTIONS,
  type DemoScenarioId,
  clearDemoNowOverride,
  clearDemoViewerId,
  readDemoScenario,
  readDemoViewerId,
  writeDemoNowOverride,
  writeDemoScenario,
  writeDemoViewerId
} from '../lib/demoControls'
import { clearDemoLocalStorage } from '../lib/demoStorage'
import { useToast } from '../hooks/useToast'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; members: Member[] }

type ConfirmAction = 'reload-snapshots' | 'clear-session' | 'reset-to-live'

function toLabel(value: Date | null): string {
  if (!value) return 'Unavailable'
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric'
  })
}

function toRelativeLabel(value: Date | null): string {
  if (!value) return 'Relative time unavailable'
  const diffMs = value.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 1) return 'Now'

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMs / 3_600_000)
  if (Math.abs(diffHours) < 48) return rtf.format(diffHours, 'hour')

  const diffDays = Math.round(diffMs / 86_400_000)
  return rtf.format(diffDays, 'day')
}

function midpoint(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.floor((end.getTime() - start.getTime()) / 2))
}

function resolveScenarioNow(matches: Match[], scenario: DemoScenarioId): Date | null {
  const group = matches
    .filter((match) => match.stage === 'Group')
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  const knockout = matches
    .filter((match) => match.stage !== 'Group')
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())

  const firstGroup = group[0] ? new Date(group[0].kickoffUtc) : null
  const lastGroup = group[group.length - 1] ? new Date(group[group.length - 1].kickoffUtc) : null
  const firstKnockout = knockout[0] ? new Date(knockout[0].kickoffUtc) : null
  const lastKnockout = knockout[knockout.length - 1] ? new Date(knockout[knockout.length - 1].kickoffUtc) : null

  if (scenario === 'pre-group') {
    return firstGroup ? new Date(firstGroup.getTime() - 2 * 60 * 60 * 1000) : null
  }
  if (scenario === 'mid-group') {
    if (firstGroup && lastGroup) return midpoint(firstGroup, lastGroup)
    return firstGroup
  }
  if (scenario === 'end-group-draw-confirmed') {
    if (!lastGroup) return null
    const afterGroup = new Date(lastGroup.getTime() + 90 * 60 * 1000)
    if (firstKnockout && afterGroup.getTime() >= firstKnockout.getTime()) {
      return new Date(firstKnockout.getTime() - 90 * 60 * 1000)
    }
    return afterGroup
  }
  if (scenario === 'mid-knockout') {
    if (firstKnockout && lastKnockout) return midpoint(firstKnockout, lastKnockout)
    return firstKnockout
  }
  if (scenario === 'world-cup-final-pending') {
    return lastKnockout ? new Date(lastKnockout.getTime() - 90 * 60 * 1000) : firstKnockout
  }
  return null
}

export default function DemoControlsPage() {
  // QA-SMOKE: route=/demo/admin?tab=demo ; checklist-id=smoke-demo-controls
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>(() => readDemoScenario())
  const [selectedViewerId, setSelectedViewerId] = useState<string>(() => readDemoViewerId() ?? '')
  const [pendingAction, setPendingAction] = useState<ConfirmAction | null>(null)
  const [isActionRunning, setIsActionRunning] = useState(false)
  const [sessionProgress, setSessionProgress] = useState(0)
  const [sessionProgressLabel, setSessionProgressLabel] = useState<string>('Idle')
  const [sessionProgressIntent, setSessionProgressIntent] = useState<'default' | 'momentum' | 'warning' | 'success'>('default')
  const { showToast, updateToast } = useToast()
  const isDemoRoute = location.pathname.startsWith('/demo/')

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, membersFile] = await Promise.all([
          fetchMatches({ mode: 'demo' }),
          fetchMembers({ mode: 'demo' })
        ])
        if (canceled) return
        const members = membersFile.members
        setState({ status: 'ready', matches: matchesFile.matches, members })
        setSelectedViewerId((current) => (current || members[0]?.id || ''))
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'Unable to load demo controls data.'
        if (!canceled) setState({ status: 'error', message: messageText })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  const scenarioNow = useMemo(() => {
    if (state.status !== 'ready') return null
    return resolveScenarioNow(state.matches, selectedScenario)
  }, [selectedScenario, state])

  function emitControlsChanged() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
  }

  function applyScenario() {
    if (!scenarioNow) return
    writeDemoScenario(selectedScenario)
    writeDemoNowOverride(scenarioNow.toISOString())
    emitControlsChanged()
    showToast({ tone: 'success', title: 'Scenario applied', message: selectedScenario })
  }

  function applyViewer() {
    if (!selectedViewerId) return
    writeDemoViewerId(selectedViewerId)
    emitControlsChanged()
    showToast({ tone: 'success', title: 'Viewer applied', message: selectedViewerId })
  }

  async function reloadSnapshots() {
    if (typeof window === 'undefined') return
    const progressToastId = showToast({
      tone: 'info',
      title: 'Reloading snapshots',
      message: 'Clearing local cache before reload...',
      progress: { value: 10, intent: 'momentum' },
      durationMs: 20_000
    })
    setSessionProgress(10)
    setSessionProgressLabel('Preparing cache cleanup...')
    setSessionProgressIntent('momentum')

    await new Promise((resolve) => window.setTimeout(resolve, 120))
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key || !key.startsWith('wc-cache:demo:')) continue
      keysToRemove.push(key)
    }
    setSessionProgress(50)
    setSessionProgressLabel(`Clearing ${keysToRemove.length} cached snapshot keys...`)
    updateToast(progressToastId, {
      message: `Clearing ${keysToRemove.length} cached snapshot keys...`,
      progress: { value: 50, intent: 'momentum' }
    })

    await new Promise((resolve) => window.setTimeout(resolve, 120))
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key)
    }
    setSessionProgress(100)
    setSessionProgressLabel('Reloading page...')
    setSessionProgressIntent('success')
    updateToast(progressToastId, {
      tone: 'success',
      title: 'Reloading now',
      message: `Cleared ${keysToRemove.length} cache keys.`,
      progress: { value: 100, intent: 'success' },
      durationMs: 4_000
    })

    window.setTimeout(() => {
      window.location.reload()
    }, 280)
  }

  function clearSession() {
    clearDemoNowOverride()
    clearDemoViewerId()
    clearDemoLocalStorage()
    emitControlsChanged()
    setSessionProgress(100)
    setSessionProgressLabel('Session cleared')
    setSessionProgressIntent('success')
    window.setTimeout(() => setSessionProgress(0), 1_100)
    showToast({ tone: 'success', title: 'Demo session cleared' })
  }

  function resetToLive() {
    clearDemoNowOverride()
    clearDemoViewerId()
    clearDemoLocalStorage()
    emitControlsChanged()
    setSessionProgress(100)
    setSessionProgressLabel('Live mode restored')
    setSessionProgressIntent('success')
    window.setTimeout(() => setSessionProgress(0), 1_100)
    showToast({ tone: 'success', title: 'Live mode restored' })
    if (isDemoRoute) {
      navigate('/admin?tab=demo#demo', { replace: true })
    }
  }

  async function runConfirmedAction() {
    if (!pendingAction || isActionRunning) return
    setIsActionRunning(true)
    try {
      if (pendingAction === 'reload-snapshots') {
        await reloadSnapshots()
      } else if (pendingAction === 'clear-session') {
        clearSession()
      } else {
        resetToLive()
      }
      setPendingAction(null)
    } finally {
      setIsActionRunning(false)
    }
  }

  const confirmationConfig = useMemo(() => {
    if (!pendingAction) return null
    if (pendingAction === 'reload-snapshots') {
      return {
        title: 'Reload demo snapshots?',
        description: 'This will clear cached demo snapshot data and reload the page.',
        confirmLabel: 'Reload snapshots'
      }
    }
    if (pendingAction === 'clear-session') {
      return {
        title: 'Clear demo session?',
        description: 'This removes demo scenario, viewer, and demo-mode local storage overrides.',
        confirmLabel: 'Clear session'
      }
    }
    return {
      title: isDemoRoute ? 'Reset to live mode?' : 'Clear demo mode data?',
      description: isDemoRoute
        ? 'This exits demo mode and clears demo overrides so you return to live admin data.'
        : 'This clears demo overrides currently stored in your browser.',
      confirmLabel: 'Reset to Live'
    }
  }, [isDemoRoute, pendingAction])

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border-border/60 p-4">Loading demo controls…</Card>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load demo controls">
        {state.message}
      </Alert>
    )
  }

  const currentScenario = readDemoScenario()
  const currentViewer = readDemoViewerId()

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Demo admin"
        title="Demo Controls"
        subtitle="Control scenario timing, selected demo user, and demo snapshot reload behavior."
      >
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">Current scenario: {currentScenario}</Badge>
          <Badge tone="secondary">Current viewer: {currentViewer ?? 'none'}</Badge>
        </div>
      </PageHeroPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60 p-4">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scenario</div>
            <select
              value={selectedScenario}
              onChange={(event) => setSelectedScenario(event.target.value as DemoScenarioId)}
              className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
            >
              {DEMO_SCENARIO_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">Local time: {toLabel(scenarioNow)}</div>
            <div className="text-xs text-muted-foreground">Relative: {toRelativeLabel(scenarioNow)}</div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={applyScenario} disabled={!scenarioNow}>
                Apply Scenario Time
              </Button>
              <Button variant="secondary" onClick={() => navigate('/demo/play')}>
                Open Demo Play
              </Button>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 p-4">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Viewer</div>
            <select
              value={selectedViewerId}
              onChange={(event) => setSelectedViewerId(event.target.value)}
              className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
            >
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.id})
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button onClick={applyViewer} disabled={!selectedViewerId}>
                Apply Viewer
              </Button>
              <Button variant="secondary" onClick={() => navigate('/demo/play/league')}>
                Open Demo League
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/60 p-4">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Session + Data</div>
          <div className="text-sm text-muted-foreground">
            Use reload after regenerating demo files with `npm run demo:simulate ...`.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPendingAction('reload-snapshots')}>
              Reload Demo Snapshots
            </Button>
            <Button variant="secondary" onClick={() => setPendingAction('clear-session')}>
              Clear Demo Session
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPendingAction('reset-to-live')}
              className="border-[var(--border-danger)] bg-[rgba(var(--danger-rgb),0.15)] text-foreground hover:bg-[rgba(var(--danger-rgb),0.26)]"
            >
              Reset to Live
            </Button>
          </div>
          {sessionProgress > 0 ? (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{sessionProgressLabel}</div>
              <Progress
                value={sessionProgress}
                intent={sessionProgressIntent}
                size="sm"
                aria-label="Demo session progress"
              />
            </div>
          ) : null}
        </div>
      </Card>

      <ConfirmationModal
        isOpen={confirmationConfig !== null}
        title={confirmationConfig?.title ?? ''}
        description={confirmationConfig?.description ?? ''}
        confirmLabel={confirmationConfig?.confirmLabel}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void runConfirmedAction()}
        isDestructive
        isLoading={isActionRunning}
      />
    </div>
  )
}
