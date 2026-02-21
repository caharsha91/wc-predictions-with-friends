export const DEMO_SCENARIO_CHANGED_EVENT = 'wc-demo-scenario-changed'

const DEMO_KEY_PREFIXES = [
  'wc-cache:demo:',
  'wc-picks:demo:',
  'wc-bracket:demo:',
  'wc-picks-wizard:demo:',
  'wc-bracket-wizard:demo:',
  'wc-play-last-focus:demo:',
  'wc-member-cache:demo',
  'wc-demo-scenario',
  'wc-demo-now-override',
  'wc-demo-phase-override',
  'wc-demo-viewer-id'
]

const DEMO_EXACT_KEYS = ['demo:lastRoute', 'demo:rivalUserIds']

function isDemoStorageKey(key: string): boolean {
  if (DEMO_EXACT_KEYS.includes(key)) return true
  return DEMO_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

export function emitDemoScenarioChanged(previousScenario: string, nextScenario: string): void {
  if (typeof window === 'undefined') return
  if (!previousScenario || !nextScenario || previousScenario === nextScenario) return
  window.dispatchEvent(
    new CustomEvent(DEMO_SCENARIO_CHANGED_EVENT, {
      detail: {
        previousScenario,
        nextScenario
      }
    })
  )
}

export function clearDemoLocalStorage(): void {
  if (typeof window === 'undefined') return
  const clearDemoKeys = (storage: Storage) => {
    const keysToRemove: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !isDemoStorageKey(key)) continue
      keysToRemove.push(key)
    }
    for (const key of keysToRemove) {
      storage.removeItem(key)
    }
  }

  clearDemoKeys(window.localStorage)
  clearDemoKeys(window.sessionStorage)
}
