import { useEffect, useState } from 'react'

import { getCurrentAppPathname, isDemoPath } from '../../lib/dataMode'
import { type DemoScenarioId, readDemoScenario } from '../lib/demoControls'
import { DEMO_SCENARIO_CHANGED_EVENT } from '../lib/demoStorage'

function resolveDemoScenario(): DemoScenarioId | null {
  if (typeof window === 'undefined') return null
  if (!isDemoPath(getCurrentAppPathname())) return null
  return readDemoScenario()
}

export function useDemoScenarioState(): DemoScenarioId | null {
  const [scenario, setScenario] = useState<DemoScenarioId | null>(() => resolveDemoScenario())

  useEffect(() => {
    if (typeof window === 'undefined') return

    const sync = () => setScenario(resolveDemoScenario())
    sync()

    window.addEventListener('storage', sync)
    window.addEventListener('hashchange', sync)
    window.addEventListener('wc-demo-controls-changed', sync as EventListener)
    window.addEventListener(DEMO_SCENARIO_CHANGED_EVENT, sync as EventListener)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener('hashchange', sync)
      window.removeEventListener('wc-demo-controls-changed', sync as EventListener)
      window.removeEventListener(DEMO_SCENARIO_CHANGED_EVENT, sync as EventListener)
    }
  }, [])

  return scenario
}
