import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type { ThemeMode } from './themes'
import {
  applyThemeAttributes,
  getStoredThemeState,
  getSystemMode,
  persistThemeState
} from './themeState'
import { useAuthState } from '../ui/hooks/useAuthState'
import { refreshCurrentUser, useCurrentUser } from '../ui/hooks/useCurrentUser'
import { getCurrentAppPathname, isDemoPath } from '../lib/dataMode'
import { hasFirebase } from '../lib/firebase'
import { saveUserThemePreference } from '../lib/firestoreData'
import type { ThemePreference } from '../types/members'

type ThemeContextValue = {
  mode: ThemeMode
  isSystemMode: boolean
  syncNotice: string | null
  setMode: (mode: ThemeMode) => void
  setSystemMode: (isSystemMode: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function normalizeThemePreference(preference: ThemePreference | undefined | null) {
  if (!preference) return null
  const isSystemMode = Boolean(preference.isSystemMode)
  const rawMode = preference.mode === 'light' || preference.mode === 'dark' ? preference.mode : null
  const mode = isSystemMode ? getSystemMode() : rawMode ?? getSystemMode()
  return { mode, isSystemMode }
}

function isThemePreferenceEqual(a: ThemePreference | null, b: ThemePreference) {
  if (!a) return false
  return a.mode === b.mode && a.isSystemMode === b.isSystemMode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const authState = useAuthState()
  const user = useCurrentUser()
  const storedState = useMemo(() => getStoredThemeState(), [])
  const [state, setState] = useState(() => ({
    mode: storedState.mode,
    isSystemMode: storedState.isSystemMode
  }))
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const updateSource = useRef<'user' | 'remote' | 'system' | null>(null)
  const lastSavedRef = useRef<ThemePreference | null>({
    mode: storedState.mode,
    isSystemMode: storedState.isSystemMode
  })
  const firestoreEnabled =
    hasFirebase &&
    authState.status === 'ready' &&
    !!authState.user &&
    user?.isMember

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
    applyThemeAttributes(state.mode)
    persistThemeState(state.mode, state.isSystemMode)
  }, [state])

  useEffect(() => {
    if (!firestoreEnabled || !user?.theme) return
    const normalized = normalizeThemePreference(user.theme)
    if (!normalized) return
    lastSavedRef.current = {
      mode: normalized.mode,
      isSystemMode: normalized.isSystemMode
    }
    setState((current) => {
      if (
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
    if (typeof window !== 'undefined' && isDemoPath(getCurrentAppPathname())) return
    if (!firestoreEnabled || !authState.user) return
    const payload: ThemePreference = {
      mode: state.mode,
      isSystemMode: state.isSystemMode
    }
    if (isThemePreferenceEqual(lastSavedRef.current, payload)) return
    void saveUserThemePreference(authState.user.email, payload)
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
      mode: state.mode,
      isSystemMode: state.isSystemMode,
      syncNotice,
      setMode,
      setSystemMode
    }),
    [setMode, setSystemMode, state, syncNotice]
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
