import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../ui/hooks/useAuthState', () => ({
  useAuthState: () => ({ status: 'disabled', user: null })
}))

vi.mock('../ui/hooks/useCurrentUser', () => ({
  useCurrentUser: () => null,
  refreshCurrentUser: vi.fn()
}))

import { ThemeProvider, useTheme } from './ThemeProvider'

function ThemeHarness() {
  const { mode, setMode } = useTheme()
  return (
    <div>
      <div data-testid="theme-mode">{mode}</div>
      <button type="button" onClick={() => setMode('dark')}>
        Switch dark
      </button>
    </div>
  )
}

describe('ThemeProvider', () => {
  it('applies dark mode and persists selection', () => {
    window.localStorage.setItem('wc-color-mode', 'light')
    window.localStorage.setItem('wc-system-mode', 'false')

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /switch dark/i }))

    expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.mode).toBe('dark')
    expect(window.localStorage.getItem('wc-color-mode')).toBe('dark')
    expect(window.localStorage.getItem('wc-system-mode')).toBe('false')
  })
})
