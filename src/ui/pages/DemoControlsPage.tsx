import { useEffect, useMemo, useState } from 'react'

import { fetchMatches, fetchMembers } from '../../lib/data'
import { removeByPrefix } from '../../lib/storage'
import type { Match } from '../../types/matches'
import type { Member } from '../../types/members'
import ConfirmationModal from '../components/ConfirmationModal'
import { CalendarIcon, CloseIcon, SettingsIcon, UsersIcon } from '../components/Icons'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/DropdownMenu'
import { SelectField } from '../components/ui/Field'
import Progress from '../components/ui/Progress'
import AdminWorkspaceShellV2 from '../components/v2/AdminWorkspaceShellV2'
import SectionCardV2 from '../components/v2/SectionCardV2'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import {
  DEMO_SCENARIO_OPTIONS,
  type DemoScenarioId,
  clearDemoNowOverride,
  clearDemoViewerId,
  readDemoScenario,
  readDemoViewerId,
  resolveDemoScenarioPhase,
  writeDemoNowOverride,
  writeDemoScenario,
  writeDemoViewerId
} from '../lib/demoControls'
import { clearDemoLocalStorage, emitDemoScenarioChanged } from '../lib/demoStorage'
import { resolveLockFlags, type LockFlags, type TournamentPhase } from '../lib/tournamentPhase'
import { useToast } from '../hooks/useToast'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; members: Member[] }

type ConfirmAction = 'reload-snapshots' | 'clear-session'

type CapabilityTone = 'info' | 'success' | 'warning'

type ScenarioCapability = {
  label: string
  value: string
  tone: CapabilityTone
}

const SCENARIO_COPY: Record<
  DemoScenarioId,
  {
    caption: string
    phaseLabel: string
    summary: string
  }
> = {
  'pre-group': {
    caption: 'Groups not started',
    phaseLabel: 'Pre-group setup',
    summary:
      'Preview the calm before kickoff. Group rankings are still editable, the knockout bracket is not open yet, and exports stay hidden until the tournament locks further.'
  },
  'mid-group': {
    caption: 'Group stage live',
    phaseLabel: 'Group stage open',
    summary:
      'Simulate the live group window where ranking decisions are still in play, match picks are locking on rolling kickoff times, and the knockout bracket remains closed.'
  },
  'end-group-draw-confirmed': {
    caption: 'Draw confirmed',
    phaseLabel: 'Knockout unlocked',
    summary:
      'Use this checkpoint once groups are settled and the draw is confirmed. Group rankings are locked, exports are available, and the bracket window is open for winner picks.'
  },
  'mid-knockout': {
    caption: 'Knockout underway',
    phaseLabel: 'Knockout locked',
    summary:
      'Jump into the elimination rounds after kickoff. Group rankings are locked, exports remain available, and the bracket window has already closed.'
  },
  'world-cup-final-pending': {
    caption: 'Final on deck',
    phaseLabel: 'Late knockout window',
    summary:
      'Preview the run-in just before the final. The tournament is deep into knockout play, the bracket is locked, and the session reflects a late-stage operations view.'
  }
}

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

function resolveScenarioPhase(scenario: DemoScenarioId): TournamentPhase {
  return (resolveDemoScenarioPhase(scenario) as TournamentPhase | null) ?? 'PRE_GROUP'
}

function buildScenarioCapabilities(phase: TournamentPhase, lockFlags: LockFlags): ScenarioCapability[] {
  return [
    {
      label: 'Group stage',
      value: lockFlags.groupEditable ? 'Ranking open' : 'Ranking locked',
      tone: lockFlags.groupEditable ? 'success' : 'warning'
    },
    {
      label: 'Match picks',
      value:
        phase === 'PRE_GROUP'
          ? 'Opening window ahead'
          : phase === 'GROUP_OPEN'
            ? 'Rolling locks live'
            : phase === 'KO_OPEN'
              ? 'Groups closed, results live'
              : phase === 'KO_LOCKED'
                ? 'Knockout underway'
                : 'Finalized',
      tone: phase === 'FINAL' ? 'warning' : 'info'
    },
    {
      label: 'Bracket',
      value:
        lockFlags.bracketEditable
          ? 'Open for picks'
          : phase === 'PRE_GROUP' || phase === 'GROUP_OPEN'
            ? 'Waiting for draw'
            : 'Locked after kickoff',
      tone: lockFlags.bracketEditable ? 'success' : phase === 'PRE_GROUP' || phase === 'GROUP_OPEN' ? 'info' : 'warning'
    },
    {
      label: 'Exports',
      value: lockFlags.exportsVisible ? 'Available' : 'Hidden until lock',
      tone: lockFlags.exportsVisible ? 'success' : 'info'
    }
  ]
}

export default function DemoControlsPage() {
  // QA-SMOKE: route=/admin/controls and /demo/admin/controls ; checklist-id=smoke-demo-controls
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>(() => readDemoScenario())
  const [appliedScenario, setAppliedScenario] = useState<DemoScenarioId>(() => readDemoScenario())
  const [selectedViewerId, setSelectedViewerId] = useState<string>(() => readDemoViewerId() ?? '')
  const [appliedViewerId, setAppliedViewerId] = useState<string>(() => readDemoViewerId() ?? '')
  const [pendingAction, setPendingAction] = useState<ConfirmAction | null>(null)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [isActionRunning, setIsActionRunning] = useState(false)
  const [sessionProgress, setSessionProgress] = useState(0)
  const [sessionProgressLabel, setSessionProgressLabel] = useState<string>('Idle')
  const [sessionProgressIntent, setSessionProgressIntent] = useState<'default' | 'momentum' | 'warning' | 'success'>('default')
  const { showToast, updateToast } = useToast()
  const mode = useRouteDataMode()
  const routeModeLabel = mode === 'demo' ? 'Demo route active (live data untouched)' : 'Live route editing demo session'

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
        setSelectedViewerId((current) => current || members[0]?.id || '')
        setAppliedViewerId((current) => current || members[0]?.id || '')
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

  const selectedScenarioNow = useMemo(() => {
    if (state.status !== 'ready') return null
    return resolveScenarioNow(state.matches, selectedScenario)
  }, [selectedScenario, state])
  const appliedScenarioNow = useMemo(() => {
    if (state.status !== 'ready') return null
    return resolveScenarioNow(state.matches, appliedScenario)
  }, [appliedScenario, state])
  const appliedViewerLabel = useMemo(() => {
    if (state.status !== 'ready') return 'Viewer unavailable'
    const appliedViewer = state.members.find((member) => member.id === appliedViewerId)
    return appliedViewer ? `${appliedViewer.name} (${appliedViewer.id})` : 'Viewer not selected'
  }, [appliedViewerId, state])
  const selectedScenarioPhase = useMemo(() => resolveScenarioPhase(selectedScenario), [selectedScenario])
  const selectedScenarioCapabilities = useMemo(
    () => buildScenarioCapabilities(selectedScenarioPhase, resolveLockFlags(selectedScenarioPhase)),
    [selectedScenarioPhase]
  )
  const scenarioSelectionDirty = selectedScenario !== appliedScenario
  const viewerSelectionDirty = selectedViewerId !== appliedViewerId
  const headerMetadata = (
    <>
      <span>{routeModeLabel}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{getScenarioLabel(appliedScenario)}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{toLabel(appliedScenarioNow)}</span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span>{appliedViewerLabel}</span>
    </>
  )

  function emitControlsChanged() {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('wc-demo-controls-changed'))
  }

  function applyScenario() {
    if (!selectedScenarioNow) return
    const previousScenario = appliedScenario
    writeDemoScenario(selectedScenario)
    writeDemoNowOverride(selectedScenarioNow.toISOString())
    emitDemoScenarioChanged(previousScenario, selectedScenario)
    emitControlsChanged()
    setAppliedScenario(selectedScenario)
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
    setAppliedViewerId(selectedViewerId)
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
    const keysToRemove = removeByPrefix('wc-cache:demo:')
    setSessionProgress(50)
    setSessionProgressLabel(`Clearing ${keysToRemove.length} cached snapshot keys...`)
    updateToast(progressToastId, {
      message: `Clearing ${keysToRemove.length} cached snapshot keys...`,
      progress: { value: 50, intent: 'momentum' }
    })

    await new Promise((resolve) => window.setTimeout(resolve, 120))
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
    setSelectedScenario('pre-group')
    setAppliedScenario('pre-group')
    if (state.status === 'ready') {
      const defaultViewerId = state.members[0]?.id ?? ''
      setSelectedViewerId(defaultViewerId)
      setAppliedViewerId(defaultViewerId)
    }
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
        title: 'Reload demo snapshots',
        description:
          'This clears cached demo snapshot keys and reloads this tab. Scenario and viewer settings stay saved. Live data is not affected.',
        confirmLabel: 'Reload snapshots'
      }
    }
    if (pendingAction === 'clear-session') {
      return {
        title: 'Clear demo session',
        description: 'This clears demo scenario/viewer/cache settings in this browser only. Live league data is not affected.',
        confirmLabel: 'Clear session'
      }
    }
    return null
  }, [pendingAction])

  return (
    <AdminWorkspaceShellV2
      title="Demo Controls"
      subtitle="Set this browser to a demo scenario, clock, and viewer. Live league data stays untouched."
      metadata={headerMetadata}
      kicker="Admin Demo"
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
          <div className="v2-section-flat admin-v2-redesign-stack">
            <SectionCardV2 tone="panel" density="none" className="admin-v2-surface admin-v2-command-flow admin-v2-demo-step-card p-3.5 md:p-4">
              <div className="space-y-4 admin-v2-command-stack">
                <div className="admin-v2-workbench-head">
                  <div className="admin-v2-demo-header-copy space-y-1">
                    <div className="admin-v2-section-label">World Cup state</div>
                    <h2 className="admin-v2-workbench-title">Choose a tournament checkpoint</h2>
                    <p className="admin-v2-workbench-subtitle">Select a demo state, review what changes there, then apply it to this browser session.</p>
                  </div>
                  <DropdownMenu open={quickMenuOpen} onOpenChange={setQuickMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="secondary">
                        Quick menu
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8} className="admin-v2-demo-menu w-[320px]">
                      <div className="admin-v2-demo-menu-section">
                        <div className="v2-type-kicker">Viewer</div>
                        <SelectField
                          label="Viewer"
                          value={selectedViewerId}
                          onChange={(event) => setSelectedViewerId(event.target.value)}
                          className="admin-v2-demo-menu-field"
                          helperText={
                            viewerSelectionDirty
                              ? `Live now: ${appliedViewerLabel}`
                              : 'Already live in this browser'
                          }
                        >
                          {state.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name} ({member.id})
                            </option>
                          ))}
                        </SelectField>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            applyViewer()
                            setQuickMenuOpen(false)
                          }}
                          disabled={!selectedViewerId}
                          icon={<UsersIcon size={15} />}
                          className="w-full"
                        >
                          Switch viewer
                        </Button>
                      </div>
                      <DropdownMenuSeparator />
                      <div className="admin-v2-demo-menu-section">
                        <DropdownMenuItem
                          className="admin-v2-demo-menu-item"
                          onSelect={() => {
                            setQuickMenuOpen(false)
                            setPendingAction('reload-snapshots')
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <SettingsIcon size={15} className="mt-0.5 shrink-0" />
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="text-sm font-semibold text-foreground">Reload snapshots</span>
                              <span className="v2-type-caption">Clears cached demo snapshots and reloads this tab.</span>
                            </div>
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="admin-v2-demo-menu-item text-destructive hover:text-destructive focus-visible:text-destructive"
                          onSelect={() => {
                            setQuickMenuOpen(false)
                            setPendingAction('clear-session')
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <CloseIcon size={15} className="mt-0.5 shrink-0" />
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="text-sm font-semibold">Clear session</span>
                              <span className="v2-type-caption">Resets demo scenario, viewer, and cached overrides in this browser.</span>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="admin-v2-demo-journey" aria-label="World Cup state journey">
                  {DEMO_SCENARIO_OPTIONS.map((option, index) => {
                    const isSelected = option.id === selectedScenario
                    const isApplied = option.id === appliedScenario
                    const stepPill = isSelected
                      ? isApplied
                        ? { label: 'Live now', tone: 'success' as const }
                        : { label: 'Selected', tone: 'info' as const }
                      : isApplied
                        ? { label: 'Live now', tone: 'success' as const }
                        : null
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="admin-v2-demo-step"
                        data-selected={isSelected || undefined}
                        data-live={isApplied || undefined}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedScenario(option.id)}
                      >
                        <span className="admin-v2-demo-step-index" aria-hidden="true">
                          {index + 1}
                        </span>
                        <span className="admin-v2-demo-step-copy">
                          <span className="admin-v2-demo-step-title">{option.label}</span>
                          <span className="admin-v2-demo-step-caption">{SCENARIO_COPY[option.id].caption}</span>
                        </span>
                        {stepPill ? (
                          <span className="admin-v2-demo-step-pill" data-tone={stepPill.tone}>
                            {stepPill.label}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>

                <div className="admin-v2-demo-preview">
                  <div className="admin-v2-workbench-head">
                    <div className="admin-v2-demo-preview-copy space-y-1">
                      <h3 className="admin-v2-workbench-title admin-v2-demo-preview-title">{getScenarioLabel(selectedScenario)}</h3>
                      <p className="admin-v2-workbench-subtitle">{SCENARIO_COPY[selectedScenario].summary}</p>
                    </div>
                    <div className="admin-v2-chip-row">
                      <span className="admin-v2-status-chip" data-tone="info">
                        {SCENARIO_COPY[selectedScenario].phaseLabel}
                      </span>
                    </div>
                  </div>

                  <div className="admin-v2-demo-meta-strip">
                    <div className="admin-v2-demo-meta-item">
                      <span className="v2-type-caption">Preview clock</span>
                      <strong>{toLabel(selectedScenarioNow)}</strong>
                    </div>
                    <div className="admin-v2-demo-meta-item">
                      <span className="v2-type-caption">Relative timing</span>
                      <strong>{toRelativeLabel(selectedScenarioNow)}</strong>
                    </div>
                    <div className="admin-v2-demo-meta-item">
                      <span className="v2-type-caption">Live session</span>
                      <strong>{scenarioSelectionDirty ? getScenarioLabel(appliedScenario) : 'Matches selection'}</strong>
                    </div>
                  </div>

                  <div className="admin-v2-demo-capability-grid">
                    {selectedScenarioCapabilities.map((capability) => (
                      <div key={capability.label} className="admin-v2-demo-capability-item" data-tone={capability.tone}>
                        <div className="v2-type-kicker">{capability.label}</div>
                        <div className="v2-type-body-sm mt-1 font-medium text-foreground">{capability.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="admin-v2-controls admin-v2-action-row admin-v2-demo-preview-actions">
                    <div className="admin-v2-row-meta">
                      {scenarioSelectionDirty
                        ? `Current session stays on ${getScenarioLabel(appliedScenario)} until you apply this state. Live league data stays untouched.`
                        : 'Live league data stays untouched.'}
                    </div>
                    <Button
                      onClick={applyScenario}
                      disabled={!selectedScenarioNow}
                      icon={<CalendarIcon size={15} />}
                      className="admin-v2-action"
                    >
                      Apply scenario
                    </Button>
                  </div>
                  {sessionProgress > 0 ? (
                    <div className="space-y-1 admin-v2-progress-anchor">
                      <div className="v2-type-meta">{sessionProgressLabel}</div>
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
            </SectionCardV2>
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
