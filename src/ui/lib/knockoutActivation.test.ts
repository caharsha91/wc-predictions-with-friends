import { describe, expect, it } from 'vitest'

import { resolveKnockoutActivation } from './knockoutActivation'

describe('resolveKnockoutActivation', () => {
  it('uses fixture inference in default mode', () => {
    const state = resolveKnockoutActivation({
      mode: 'default',
      demoScenario: null,
      groupComplete: true,
      drawReady: true,
      knockoutStarted: false
    })

    expect(state.active).toBe(true)
    expect(state.forcedByDemoScenario).toBe(false)
    expect(state.mismatchWarning).toBeNull()
    expect(state.sourceOfTruthLabel).toBe('Fixture inference')
  })

  it('forces knockout active in demo mid-knockout when inference is inactive', () => {
    const state = resolveKnockoutActivation({
      mode: 'demo',
      demoScenario: 'mid-knockout',
      groupComplete: false,
      drawReady: false,
      knockoutStarted: false
    })

    expect(state.active).toBe(true)
    expect(state.forcedByDemoScenario).toBe(true)
    expect(state.inferredActive).toBe(false)
    expect(state.mismatchWarning).toMatch(/demo scenario override keeps knockout active/i)
    expect(state.sourceOfTruthLabel).toMatch(/demo scenario override/i)
  })

  it('does not show mismatch warning when forced and inferred are both active', () => {
    const state = resolveKnockoutActivation({
      mode: 'demo',
      demoScenario: 'world-cup-final-pending',
      groupComplete: true,
      drawReady: true,
      knockoutStarted: false
    })

    expect(state.active).toBe(true)
    expect(state.forcedByDemoScenario).toBe(true)
    expect(state.inferredActive).toBe(true)
    expect(state.mismatchWarning).toBeNull()
  })
})
