import type { DataMode } from '../../lib/dataMode'
import type { DemoScenarioId } from './demoControls'

const DEMO_FORCED_KNOCKOUT_SCENARIOS = new Set<DemoScenarioId>([
  'end-group-draw-confirmed',
  'mid-knockout',
  'world-cup-final-pending'
])

type KnockoutActivationParams = {
  mode: DataMode
  demoScenario: DemoScenarioId | null
  groupComplete: boolean
  drawReady: boolean
  knockoutStarted: boolean
}

export type KnockoutActivationState = {
  active: boolean
  inferredActive: boolean
  forcedByDemoScenario: boolean
  mismatchWarning: string | null
  sourceOfTruthLabel: string
}

function buildInferenceReason(params: Omit<KnockoutActivationParams, 'mode' | 'demoScenario'>): string {
  const blockers: string[] = []
  if (!params.groupComplete) blockers.push('group stage is not complete')
  if (!params.drawReady) blockers.push('fixture draw is incomplete')
  if (params.knockoutStarted) blockers.push('knockout has already started')
  if (blockers.length === 0) return 'fixture inference marks knockout as active'
  return `fixture inference marks knockout inactive because ${blockers.join(', ')}`
}

export function resolveKnockoutActivation(params: KnockoutActivationParams): KnockoutActivationState {
  const inferredActive = params.groupComplete && params.drawReady && !params.knockoutStarted
  const forcedByDemoScenario =
    params.mode === 'demo' &&
    params.demoScenario !== null &&
    DEMO_FORCED_KNOCKOUT_SCENARIOS.has(params.demoScenario)

  if (!forcedByDemoScenario) {
    return {
      active: inferredActive,
      inferredActive,
      forcedByDemoScenario: false,
      mismatchWarning: null,
      sourceOfTruthLabel: 'Fixture inference'
    }
  }

  return {
    active: true,
    inferredActive,
    forcedByDemoScenario: true,
    mismatchWarning: inferredActive
      ? null
      : `Demo scenario override keeps knockout active (${params.demoScenario}) while ${buildInferenceReason(params)}.`,
    sourceOfTruthLabel: `Demo scenario override (${params.demoScenario})`
  }
}
