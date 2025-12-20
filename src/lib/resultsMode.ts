export type ResultsMode = 'live' | 'simulated'

const STORAGE_KEY = 'wc-results-mode'

export function getResultsMode(): ResultsMode {
  if (typeof window === 'undefined') return 'live'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'simulated' ? 'simulated' : 'live'
}

export function setResultsMode(mode: ResultsMode): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, mode)
}
