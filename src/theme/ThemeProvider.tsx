import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { ThemeId, ThemeMode } from './themes'
import { DEFAULT_THEME_ID, THEMES } from './themes'
import {
  applyThemeAttributes,
  getStoredThemeState,
  getSystemMode,
  persistThemeState
} from './themeState'

type ThemeContextValue = {
  themeId: ThemeId
  mode: ThemeMode
  isSystemMode: boolean
  setThemeId: (themeId: ThemeId) => void
  setMode: (mode: ThemeMode) => void
  setSystemMode: (isSystemMode: boolean) => void
  themes: typeof THEMES
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    const stored = getStoredThemeState()
    return {
      themeId: stored.themeId ?? DEFAULT_THEME_ID,
      mode: stored.mode,
      isSystemMode: stored.isSystemMode
    }
  })

  const setThemeId = useCallback((themeId: ThemeId) => {
    setState((current) => ({ ...current, themeId }))
  }, [])

  const setMode = useCallback((mode: ThemeMode) => {
    setState((current) => ({ ...current, mode, isSystemMode: false }))
  }, [])

  const setSystemMode = useCallback((isSystemMode: boolean) => {
    setState((current) => ({
      ...current,
      isSystemMode,
      mode: isSystemMode ? getSystemMode() : current.mode
    }))
  }, [])

  useEffect(() => {
    applyThemeAttributes(state.themeId, state.mode)
    persistThemeState(state.themeId, state.mode, state.isSystemMode)
  }, [state])

  useEffect(() => {
    if (!state.isSystemMode || typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setState((current) => {
        if (!current.isSystemMode) return current
        return { ...current, mode: media.matches ? 'dark' : 'light' }
      })
    }
    handleChange()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
      return () => media.removeEventListener('change', handleChange)
    }
    media.addListener(handleChange)
    return () => media.removeListener(handleChange)
  }, [state.isSystemMode])

  const value = useMemo(
    () => ({
      themeId: state.themeId,
      mode: state.mode,
      isSystemMode: state.isSystemMode,
      setThemeId,
      setMode,
      setSystemMode,
      themes: THEMES
    }),
    [setMode, setSystemMode, setThemeId, state]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
