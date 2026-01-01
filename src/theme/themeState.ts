import type { ThemeId, ThemeMode } from './themes'
import { DEFAULT_THEME_ID, THEMES } from './themes'

export type ThemeState = {
  themeId: ThemeId
  mode: ThemeMode
  isSystemMode: boolean
}

const THEME_STORAGE_KEY = 'wc-theme-id'
const MODE_STORAGE_KEY = 'wc-color-mode'
const SYSTEM_MODE_STORAGE_KEY = 'wc-system-mode'

const THEME_IDS = new Set(THEMES.map((theme) => theme.id))

export function getSystemMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredThemeState(): ThemeState {
  if (typeof window === 'undefined') {
    return {
      themeId: DEFAULT_THEME_ID,
      mode: 'dark',
      isSystemMode: false
    }
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  const themeId = THEME_IDS.has(storedTheme as ThemeId) ? (storedTheme as ThemeId) : DEFAULT_THEME_ID
  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)
  const storedSystemMode = window.localStorage.getItem(SYSTEM_MODE_STORAGE_KEY)
  const isSystemMode = storedSystemMode === 'true'
  const systemMode = getSystemMode()
  const mode =
    isSystemMode || (storedMode !== 'light' && storedMode !== 'dark')
      ? systemMode
      : (storedMode as ThemeMode)

  return { themeId, mode, isSystemMode }
}

export function applyThemeAttributes(themeId: ThemeId, mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = themeId
  root.dataset.mode = mode
}

export function persistThemeState(themeId: ThemeId, mode: ThemeMode, isSystemMode: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, themeId)
  window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  window.localStorage.setItem(SYSTEM_MODE_STORAGE_KEY, String(isSystemMode))
}

export function applyInitialTheme() {
  const { themeId, mode } = getStoredThemeState()
  applyThemeAttributes(themeId, mode)
}
