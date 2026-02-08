import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastTone = 'info' | 'success' | 'warning' | 'danger'

type ToastItem = {
  id: string
  title: string
  message?: string
  tone: ToastTone
}

type ShowToastInput = {
  title: string
  message?: string
  tone?: ToastTone
  durationMs?: number
}

type ToastContextValue = {
  showToast: (input: ShowToastInput) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION_MS = 10_000

function toneClass(tone: ToastTone): string {
  if (tone === 'success') return 'border-[rgba(var(--primary-rgb),0.5)] bg-[rgba(var(--primary-rgb),0.14)]'
  if (tone === 'warning') return 'border-[rgba(var(--warn-rgb),0.46)] bg-[rgba(var(--warn-rgb),0.14)]'
  if (tone === 'danger') return 'border-[rgba(var(--danger-rgb),0.48)] bg-[rgba(var(--danger-rgb),0.14)]'
  return 'border-[rgba(var(--info-rgb),0.52)] bg-[rgba(var(--info-rgb),0.14)]'
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timeoutsRef = useRef<Map<string, number>>(new Map())

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timeoutId = timeoutsRef.current.get(id)
    if (timeoutId) {
      window.clearTimeout(timeoutId)
      timeoutsRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (input: ShowToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const next: ToastItem = {
        id,
        title: input.title,
        message: input.message,
        tone: input.tone ?? 'info'
      }
      setToasts((current) => [...current, next])

      const timeoutId = window.setTimeout(() => {
        dismissToast(id)
      }, input.durationMs ?? DEFAULT_DURATION_MS)
      timeoutsRef.current.set(id, timeoutId)
    },
    [dismissToast]
  )

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      timeoutsRef.current.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ showToast, dismissToast }), [dismissToast, showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(92vw,26rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-left shadow-[var(--shadow1)] ${toneClass(toast.tone)}`}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{toast.title}</div>
            {toast.message ? <div className="mt-1 text-sm text-foreground">{toast.message}</div> : null}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context) return context
  return {
    showToast: () => {},
    dismissToast: () => {}
  }
}
