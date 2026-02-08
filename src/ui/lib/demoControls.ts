export type DemoScenarioId =
  | 'pre-group'
  | 'mid-group'
  | 'end-group-draw-confirmed'
  | 'mid-knockout'
  | 'world-cup-final-pending'

export const DEMO_SCENARIO_OPTIONS: Array<{ id: DemoScenarioId; label: string }> = [
  { id: 'pre-group', label: 'Pre group stage' },
  { id: 'mid-group', label: 'Mid group stage' },
  { id: 'end-group-draw-confirmed', label: 'End group stage + draw confirmed' },
  { id: 'mid-knockout', label: 'Mid knockout phase' },
  { id: 'world-cup-final-pending', label: 'World Cup final pending' }
]

export const DEMO_SCENARIO_STORAGE_KEY = 'wc-demo-scenario'
export const DEMO_NOW_OVERRIDE_STORAGE_KEY = 'wc-demo-now-override'
export const DEMO_VIEWER_ID_STORAGE_KEY = 'wc-demo-viewer-id'

export function readDemoScenario(): DemoScenarioId {
  if (typeof window === 'undefined') return 'pre-group'
  const raw = window.localStorage.getItem(DEMO_SCENARIO_STORAGE_KEY)
  if (
    raw === 'pre-group' ||
    raw === 'mid-group' ||
    raw === 'end-group-draw-confirmed' ||
    raw === 'mid-knockout' ||
    raw === 'world-cup-final-pending'
  ) {
    return raw
  }
  return 'pre-group'
}

export function writeDemoScenario(value: DemoScenarioId): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_SCENARIO_STORAGE_KEY, value)
}

export function readDemoNowOverride(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(DEMO_NOW_OVERRIDE_STORAGE_KEY)
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function writeDemoNowOverride(value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_NOW_OVERRIDE_STORAGE_KEY, value)
}

export function clearDemoNowOverride(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_NOW_OVERRIDE_STORAGE_KEY)
}

export function readDemoViewerId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(DEMO_VIEWER_ID_STORAGE_KEY)?.trim()
  return raw ? raw : null
}

export function writeDemoViewerId(value: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_VIEWER_ID_STORAGE_KEY, value)
}

export function clearDemoViewerId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_VIEWER_ID_STORAGE_KEY)
}
