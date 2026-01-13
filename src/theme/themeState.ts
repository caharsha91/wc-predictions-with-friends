import type { ThemeMode } from './themes'

export type ThemeState = {
  mode: ThemeMode
  isSystemMode: boolean
}

const MODE_STORAGE_KEY = 'wc-color-mode'
const SYSTEM_MODE_STORAGE_KEY = 'wc-system-mode'

export function getSystemMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredThemeState(): ThemeState {
  if (typeof window === 'undefined') {
    return {
      mode: 'dark',
      isSystemMode: false
    }
  }

  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)
  const storedSystemMode = window.localStorage.getItem(SYSTEM_MODE_STORAGE_KEY)
  const isSystemMode = storedSystemMode === 'true'
  const systemMode = getSystemMode()
  const mode = isSystemMode
    ? systemMode
    : storedMode === 'light' || storedMode === 'dark'
      ? storedMode
      : 'dark'

  return { mode, isSystemMode }
}

export function applyThemeAttributes(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.removeAttribute('data-theme')
  root.dataset.mode = mode
}

export function persistThemeState(mode: ThemeMode, isSystemMode: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  window.localStorage.setItem(SYSTEM_MODE_STORAGE_KEY, String(isSystemMode))
  window.localStorage.removeItem('wc-theme-id')
}

export function applyInitialTheme() {
  const { mode } = getStoredThemeState()
  applyThemeAttributes(mode)
}
