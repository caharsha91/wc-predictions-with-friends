import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEasterEggs } from './useEasterEggs'

const setMode = vi.fn()
const setSystemMode = vi.fn()

const themeState = {
  mode: 'dark' as 'light' | 'dark',
  isSystemMode: false,
  setMode,
  setSystemMode,
  syncNotice: null
}

vi.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => themeState
}))

describe('useEasterEggs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMode.mockReset()
    setSystemMode.mockReset()
    themeState.mode = 'dark'
    themeState.isSystemMode = false
    window.sessionStorage.clear()
  })

  it('toggles compact sidebar after five logo clicks within threshold', () => {
    const { result } = renderHook(() => useEasterEggs())

    act(() => {
      for (let i = 0; i < 5; i += 1) result.current.onLogoClick()
    })

    expect(result.current.sidebarCompact).toBe(true)
    expect(window.sessionStorage.getItem('wc-sidebar-compact')).toBe('1')
  })

  it('cycles theme on logo long press', () => {
    themeState.mode = 'light'
    themeState.isSystemMode = false

    const { result } = renderHook(() => useEasterEggs())

    act(() => {
      result.current.onLogoPointerDown()
      vi.advanceTimersByTime(950)
    })

    expect(setMode).toHaveBeenCalledWith('dark')
    expect(setSystemMode).not.toHaveBeenCalled()
  })

  it('activates and clears pop highlight after four last-updated taps', () => {
    const { result } = renderHook(() => useEasterEggs())

    act(() => {
      for (let i = 0; i < 4; i += 1) result.current.onLastUpdatedTap()
    })

    expect(result.current.popHighlightActive).toBe(true)

    act(() => {
      vi.advanceTimersByTime(20_100)
    })

    expect(result.current.popHighlightActive).toBe(false)
  })
})
