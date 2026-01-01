import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { ThemeId, ThemeMode } from './themes'
import { DEFAULT_THEME_ID, THEMES } from './themes'
import {
  applyThemeAttributes,
  getStoredThemeState,
  getSystemMode,
  persistThemeState
} from './themeState'
import { useAuthState } from '../ui/hooks/useAuthState'
import { refreshCurrentUser, useCurrentUser } from '../ui/hooks/useCurrentUser'
import { useSimulationState } from '../ui/hooks/useSimulationState'
import { hasFirebase } from '../lib/firebase'
import { saveUserThemePreference } from '../lib/firestoreData'
import type { ThemePreference } from '../types/members'

type ThemeContextValue = {
  themeId: ThemeId
  mode: ThemeMode
  isSystemMode: boolean
  syncNotice: string | null
  setThemeId: (themeId: ThemeId) => void
  setMode: (mode: ThemeMode) => void
  setSystemMode: (isSystemMode: boolean) => void
  themes: typeof THEMES
}

const ThemeContext = createContext<ThemeContextValue | null>(null)
const THEME_ID_SET = new Set(THEMES.map((theme) => theme.id))

function normalizeThemePreference(preference: ThemePreference | undefined | null) {
  if (!preference) return null
  const themeId = THEME_ID_SET.has(preference.id) ? preference.id : DEFAULT_THEME_ID
  const isSystemMode = Boolean(preference.isSystemMode)
  const rawMode = preference.mode === 'light' || preference.mode === 'dark' ? preference.mode : null
  const mode = isSystemMode ? getSystemMode() : rawMode ?? getSystemMode()
  return { themeId, mode, isSystemMode }
}

function isThemePreferenceEqual(a: ThemePreference | null, b: ThemePreference) {
  if (!a) return false
  return a.id === b.id && a.mode === b.mode && a.isSystemMode === b.isSystemMode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const authState = useAuthState()
  const user = useCurrentUser()
  const simulation = useSimulationState()
  const storedState = useMemo(() => getStoredThemeState(), [])
  const [state, setState] = useState(() => ({
    themeId: storedState.themeId ?? DEFAULT_THEME_ID,
    mode: storedState.mode,
    isSystemMode: storedState.isSystemMode
  }))
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const updateSource = useRef<'user' | 'remote' | 'system' | null>(null)
  const lastSavedRef = useRef<ThemePreference | null>({
    id: storedState.themeId ?? DEFAULT_THEME_ID,
    mode: storedState.mode,
    isSystemMode: storedState.isSystemMode
  })
  const firestoreEnabled =
    hasFirebase && authState.status === 'ready' && !!authState.user && !simulation.enabled

  const setThemeId = useCallback((themeId: ThemeId) => {
    updateSource.current = 'user'
    setState((current) => ({ ...current, themeId }))
  }, [])

  const setMode = useCallback((mode: ThemeMode) => {
    updateSource.current = 'user'
    setState((current) => ({ ...current, mode, isSystemMode: false }))
  }, [])

  const setSystemMode = useCallback((isSystemMode: boolean) => {
    updateSource.current = 'user'
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
    if (!firestoreEnabled || !user?.theme) return
    const normalized = normalizeThemePreference(user.theme)
    if (!normalized) return
    lastSavedRef.current = {
      id: normalized.themeId,
      mode: normalized.mode,
      isSystemMode: normalized.isSystemMode
    }
    setState((current) => {
      if (
        current.themeId === normalized.themeId &&
        current.mode === normalized.mode &&
        current.isSystemMode === normalized.isSystemMode
      ) {
        return current
      }
      updateSource.current = 'remote'
      return normalized
    })
  }, [firestoreEnabled, user?.theme])

  useEffect(() => {
    const source = updateSource.current
    updateSource.current = null
    if (source !== 'user') return
    if (!firestoreEnabled || !authState.user) return
    const payload: ThemePreference = {
      id: state.themeId,
      mode: state.mode,
      isSystemMode: state.isSystemMode
    }
    if (isThemePreferenceEqual(lastSavedRef.current, payload)) return
    void saveUserThemePreference(authState.user.uid, payload)
      .then(() => {
        lastSavedRef.current = payload
        setSyncNotice('Synced')
        refreshCurrentUser()
      })
      .catch(() => null)
  }, [authState.user, firestoreEnabled, state])

  useEffect(() => {
    if (!syncNotice) return
    const timeout = window.setTimeout(() => setSyncNotice(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [syncNotice])

  useEffect(() => {
    if (!state.isSystemMode || typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      updateSource.current = 'system'
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
      syncNotice,
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
