import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useTheme } from '../../theme/ThemeProvider'
import { useToast } from './useToast'

const SIDEBAR_COMPACT_KEY = 'wc-sidebar-compact'
const LOGO_CLICK_WINDOW_MS = 2000
const LAST_UPDATED_TAP_WINDOW_MS = 2200
const LOGO_HOLD_MS = 900
const POP_HIGHLIGHT_MS = 20_000

function readCompactMode() {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem(SIDEBAR_COMPACT_KEY) === '1'
}

export function useEasterEggs() {
  const { mode, isSystemMode, setMode, setSystemMode } = useTheme()
  const { showToast } = useToast()
  const [sidebarCompact, setSidebarCompact] = useState(readCompactMode)
  const [popHighlightActive, setPopHighlightActive] = useState(false)

  const logoClicksRef = useRef<number[]>([])
  const metaTapsRef = useRef<number[]>([])
  const holdTimerRef = useRef<number | null>(null)
  const popTimerRef = useRef<number | null>(null)
  const suppressNextClickRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(SIDEBAR_COMPACT_KEY, sidebarCompact ? '1' : '0')
  }, [sidebarCompact])

  useEffect(
    () => () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current)
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current)
    },
    []
  )

  const cycleThemeMode = useCallback(() => {
    if (isSystemMode) {
      setMode('light')
      showToast({ title: 'Theme updated', message: 'Theme: Light', tone: 'info' })
      return
    }

    if (mode === 'light') {
      setMode('dark')
      showToast({ title: 'Theme updated', message: 'Theme: Dark', tone: 'info' })
      return
    }

    setSystemMode(true)
    showToast({ title: 'Theme updated', message: 'Theme: System', tone: 'info' })
  }, [isSystemMode, mode, setMode, setSystemMode, showToast])

  const activatePopHighlight = useCallback(() => {
    setPopHighlightActive(true)
    if (popTimerRef.current) {
      window.clearTimeout(popTimerRef.current)
    }
    popTimerRef.current = window.setTimeout(() => {
      setPopHighlightActive(false)
      popTimerRef.current = null
    }, POP_HIGHLIGHT_MS)
  }, [])

  const onLogoClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }

    const now = Date.now()
    logoClicksRef.current = logoClicksRef.current.filter((ts) => now - ts <= LOGO_CLICK_WINDOW_MS)
    logoClicksRef.current.push(now)

    if (logoClicksRef.current.length < 5) return

    logoClicksRef.current = []
    setSidebarCompact((current) => {
      const next = !current
      showToast({
        title: 'Focus mode',
        message: next ? 'Compact sidebar on' : 'Compact sidebar off',
        tone: 'info'
      })
      return next
    })
  }, [showToast])

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const onLogoPointerDown = useCallback(() => {
    clearHoldTimer()
    holdTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true
      cycleThemeMode()
    }, LOGO_HOLD_MS)
  }, [clearHoldTimer, cycleThemeMode])

  const onLogoPointerUp = useCallback(() => {
    clearHoldTimer()
  }, [clearHoldTimer])

  const onLastUpdatedTap = useCallback(() => {
    const now = Date.now()
    metaTapsRef.current = metaTapsRef.current.filter((ts) => now - ts <= LAST_UPDATED_TAP_WINDOW_MS)
    metaTapsRef.current.push(now)

    if (metaTapsRef.current.length < 4) return

    metaTapsRef.current = []
    activatePopHighlight()
    showToast({ title: 'Pop focus', message: 'Pop focus active for 20s', tone: 'info' })
  }, [activatePopHighlight, showToast])

  return useMemo(
    () => ({
      sidebarCompact,
      popHighlightActive,
      onLogoClick,
      onLogoPointerDown,
      onLogoPointerUp,
      onLogoPointerLeave: onLogoPointerUp,
      onLogoPointerCancel: onLogoPointerUp,
      onLastUpdatedTap
    }),
    [
      onLastUpdatedTap,
      onLogoClick,
      onLogoPointerDown,
      onLogoPointerUp,
      popHighlightActive,
      sidebarCompact
    ]
  )
}
