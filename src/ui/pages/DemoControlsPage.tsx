import { useEffect, useMemo, useState } from 'react'

import { fetchMatches, fetchMembers } from '../../lib/data'
import type { Match } from '../../types/matches'
import type { Member } from '../../types/members'
import ConfirmationModal from '../components/ConfirmationModal'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { SelectField } from '../components/ui/Field'
import Progress from '../components/ui/Progress'
import { CalendarIcon, CloseIcon, SettingsIcon, UsersIcon } from '../components/Icons'
import AdminWorkspaceShellV2 from '../components/v2/AdminWorkspaceShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
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
import { clearDemoLocalStorage, emitDemoScenarioChanged } from '../lib/demoStorage'
import { useToast } from '../hooks/useToast'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; members: Member[] }

type ConfirmAction = 'reload-snapshots' | 'clear-session'

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

function getScenarioLabel(scenario: DemoScenarioId): string {
  return DEMO_SCENARIO_OPTIONS.find((option) => option.id === scenario)?.label ?? scenario
}

export default function DemoControlsPage() {
  // QA-SMOKE: route=/admin/controls and /demo/admin/controls ; checklist-id=smoke-demo-controls
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>(() => readDemoScenario())
  const [selectedViewerId, setSelectedViewerId] = useState<string>(() => readDemoViewerId() ?? '')
  const [pendingAction, setPendingAction] = useState<ConfirmAction | null>(null)
  const [isActionRunning, setIsActionRunning] = useState(false)
  const [sessionProgress, setSessionProgress] = useState(0)
  const [sessionProgressLabel, setSessionProgressLabel] = useState<string>('Idle')
  const [sessionProgressIntent, setSessionProgressIntent] = useState<'default' | 'momentum' | 'warning' | 'success'>('default')
  const { showToast, updateToast } = useToast()

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
  const selectedViewerLabel = useMemo(() => {
    if (state.status !== 'ready') return 'Viewer unavailable'
    const selectedViewer = state.members.find((member) => member.id === selectedViewerId)
    return selectedViewer ? `${selectedViewer.name} (${selectedViewer.id})` : 'Viewer not selected'
  }, [selectedViewerId, state])
  const headerMetadata = (
    <>
      <span>{getScenarioLabel(selectedScenario)}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{toLabel(scenarioNow)}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{selectedViewerLabel}</span>
    </>
  )

  function emitControlsChanged() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
  }

  function applyScenario() {
    if (!scenarioNow) return
    const previousScenario = readDemoScenario()
    writeDemoScenario(selectedScenario)
    writeDemoNowOverride(scenarioNow.toISOString())
    emitDemoScenarioChanged(previousScenario, selectedScenario)
    emitControlsChanged()
    showToast({
      tone: 'success',
      title: 'Scenario updated',
      message: getScenarioLabel(selectedScenario)
    })
  }

  function applyViewer() {
    if (!selectedViewerId) return
    writeDemoViewerId(selectedViewerId)
    emitControlsChanged()
    const viewerLabel =
      state.status === 'ready'
        ? state.members.find((member) => member.id === selectedViewerId)?.name ?? selectedViewerId
        : selectedViewerId
    showToast({ tone: 'success', title: 'Viewer updated', message: viewerLabel })
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

  async function runConfirmedAction() {
    if (!pendingAction || isActionRunning) return
    setIsActionRunning(true)
    try {
      if (pendingAction === 'reload-snapshots') {
        await reloadSnapshots()
      } else {
        clearSession()
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
        description: 'This clears demo scenario and viewer settings saved in this browser.',
        confirmLabel: 'Clear session'
      }
    }
    return null
  }, [pendingAction])

  return (
    <AdminWorkspaceShellV2
      title="Demo Controls"
      subtitle="Configure scenario, viewer, and demo session data."
      metadata={headerMetadata}
    >
      <div className="space-y-4">
        {state.status === 'loading' ? (
          <SectionCardV2 tone="panel" density="none" className="admin-v2-surface-muted p-4 md:p-5">
            Loading demo controls...
          </SectionCardV2>
        ) : null}

        {state.status === 'error' ? (
          <Alert tone="danger" title="Unable to load demo controls" className="admin-v2-inline-alert">
            {state.message}
          </Alert>
        ) : null}

        {state.status === 'ready' ? (
          <div className="v2-section-flat">
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="admin-v2-section-label">Scenario</div>
                <div className="admin-v2-controls">
                  <SelectField
                    label="Scenario"
                    value={selectedScenario}
                    onChange={(event) => setSelectedScenario(event.target.value as DemoScenarioId)}
                    labelHidden
                  >
                    {DEMO_SCENARIO_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    onClick={applyScenario}
                    disabled={!scenarioNow}
                    icon={<CalendarIcon size={15} />}
                    className="admin-v2-action"
                  >
                    Apply scenario
                  </Button>
                </div>
                <div className="admin-v2-row-meta">
                  {toLabel(scenarioNow)} • {toRelativeLabel(scenarioNow)}
                </div>
              </div>

              <div className="admin-v2-divider" />

              <div className="space-y-3">
                <div className="admin-v2-section-label">Viewer (optional)</div>
                <div className="admin-v2-controls">
                  <SelectField
                    label="Viewer"
                    value={selectedViewerId}
                    onChange={(event) => setSelectedViewerId(event.target.value)}
                    labelHidden
                  >
                    {state.members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.id})
                      </option>
                    ))}
                  </SelectField>
                  <Button
                    variant="secondary"
                    onClick={applyViewer}
                    disabled={!selectedViewerId}
                    icon={<UsersIcon size={15} />}
                    className="admin-v2-action"
                  >
                    Switch viewer
                  </Button>
                </div>
                <div className="admin-v2-row-meta">Affects leaderboard + user data.</div>
              </div>

              <div className="admin-v2-divider" />

              <div className="space-y-3">
                <div className="admin-v2-section-label">Utilities</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPendingAction('reload-snapshots')}
                    icon={<SettingsIcon size={15} />}
                    className="admin-v2-action w-full justify-start rounded-lg"
                  >
                    Reload snapshots
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPendingAction('clear-session')}
                    icon={<CloseIcon size={15} />}
                    className="admin-v2-action admin-v2-danger w-full justify-start rounded-lg"
                  >
                    Clear session
                  </Button>
                </div>
                <div className="admin-v2-inline-alert admin-v2-inline-alert-warning text-[13px]">
                  Reload overrides current demo data.
                </div>
                {sessionProgress > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[13px] text-muted-foreground">{sessionProgressLabel}</div>
                    <Progress
                      value={sessionProgress}
                      intent={sessionProgressIntent}
                      size="sm"
                      aria-label="Demo session progress"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

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
    </AdminWorkspaceShellV2>
  )
}
