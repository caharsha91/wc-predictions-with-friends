import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type AppShellContextValue = {
  topBarAction: ReactNode | null
  setTopBarAction: (action: ReactNode | null) => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [topBarAction, setTopBarAction] = useState<ReactNode | null>(null)

  const value = useMemo(
    () => ({
      topBarAction,
      setTopBarAction
    }),
    [topBarAction]
  )

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
}

export function useAppShell() {
  return useContext(AppShellContext)
}

export function useTopBarAction(action: ReactNode | null) {
  const context = useAppShell()

  useEffect(() => {
    if (!context) return
    context.setTopBarAction(action)
    return () => {
      context.setTopBarAction(null)
    }
  }, [action, context])
}
