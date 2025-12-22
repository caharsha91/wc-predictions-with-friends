export type ListDensity = 'comfy' | 'compact'

const STORAGE_KEY = 'wc-list-density'
const DEFAULT_DENSITY: ListDensity = 'comfy'

export function getListDensity(): ListDensity {
  if (typeof window === 'undefined') return DEFAULT_DENSITY
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'compact' ? 'compact' : DEFAULT_DENSITY
}

export function applyListDensity(density: ListDensity): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = density
}

export function setListDensity(density: ListDensity): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, density)
  }
  applyListDensity(density)
}
