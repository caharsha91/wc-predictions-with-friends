export type ColorMode = 'dark' | 'light'

const STORAGE_KEY = 'wc-color-mode'
const DEFAULT_MODE: ColorMode = 'dark'

export function getColorMode(): ColorMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_MODE
}

export function applyColorMode(mode: ColorMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.mode = mode
}

export function setColorMode(mode: ColorMode): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }
  applyColorMode(mode)
}

export function toggleColorMode(): ColorMode {
  const next = getColorMode() === 'dark' ? 'light' : 'dark'
  setColorMode(next)
  return next
}
