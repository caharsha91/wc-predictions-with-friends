import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchMatches, fetchMembers } from '../../lib/data'
import type { Match } from '../../types/matches'
import type { Member } from '../../types/members'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
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

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; members: Member[] }

function toIso(value: Date | null): string {
  return value ? value.toISOString() : '—'
}

function toLabel(value: Date | null): string {
  if (!value) return 'Unavailable'
  return value.toLocaleString(undefined, {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    year: 'numeric'
  })
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
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedScenario, setSelectedScenario] = useState<DemoScenarioId>(() => readDemoScenario())
  const [selectedViewerId, setSelectedViewerId] = useState<string>(() => readDemoViewerId() ?? '')
  const [message, setMessage] = useState<string | null>(null)

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
    setMessage(`Scenario applied: ${selectedScenario}`)
  }

  function applyViewer() {
    if (!selectedViewerId) return
    writeDemoViewerId(selectedViewerId)
    emitControlsChanged()
    setMessage(`Viewer applied: ${selectedViewerId}`)
  }

  function reloadSnapshots() {
    if (typeof window === 'undefined') return
    const keysToRemove: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (!key || !key.startsWith('wc-cache:demo:')) continue
      keysToRemove.push(key)
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key)
    }
    window.location.reload()
  }

  function clearSession() {
    clearDemoNowOverride()
    clearDemoViewerId()
    clearDemoLocalStorage()
    emitControlsChanged()
    setMessage('Demo session cleared.')
  }

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

      {message ? <Alert tone="success">{message}</Alert> : null}

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
            <div className="text-xs text-muted-foreground">Pacific preview: {toLabel(scenarioNow)}</div>
            <div className="text-xs text-muted-foreground">UTC: {toIso(scenarioNow)}</div>
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
            <Button variant="secondary" onClick={reloadSnapshots}>
              Reload Demo Snapshots
            </Button>
            <Button variant="secondary" onClick={clearSession}>
              Clear Demo Session
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
