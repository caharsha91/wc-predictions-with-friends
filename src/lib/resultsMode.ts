export const RESULTS_MODES = [
  'live',
  'sim-group-partial',
  'sim-group-complete',
  'sim-knockout-partial',
  'sim-knockout-complete'
] as const

export type ResultsMode = (typeof RESULTS_MODES)[number]

const STORAGE_KEY = 'wc-results-mode'

export function getResultsMode(): ResultsMode {
  if (typeof window === 'undefined') return 'live'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return RESULTS_MODES.includes(stored as ResultsMode) ? (stored as ResultsMode) : 'live'
}

export function setResultsMode(mode: ResultsMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, mode)
}

export function getResultsSuffix(mode: ResultsMode): string | null {
  switch (mode) {
    case 'sim-group-partial':
      return 'simulated-group-partial'
    case 'sim-group-complete':
      return 'simulated-group-complete'
    case 'sim-knockout-partial':
      return 'simulated-knockout-partial'
    case 'sim-knockout-complete':
      return 'simulated-knockout-complete'
    default:
      return null
  }
}
