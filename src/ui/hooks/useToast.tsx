import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import Progress, { type ProgressIntent } from '../components/ui/Progress'

type ToastTone = 'info' | 'success' | 'warning' | 'danger'

type ToastProgress = {
  value: number
  intent?: ProgressIntent
}

type ToastItem = {
  id: string
  title: string
  message?: string
  tone: ToastTone
  progress?: ToastProgress
}

type ShowToastInput = {
  title: string
  message?: string
  tone?: ToastTone
  durationMs?: number
  progress?: ToastProgress
}

type UpdateToastInput = {
  title?: string
  message?: string
  tone?: ToastTone
  durationMs?: number
  progress?: ToastProgress | null
}

type ToastContextValue = {
  showToast: (input: ShowToastInput) => string
  updateToast: (id: string, update: UpdateToastInput) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION_MS = 10_000
const MAX_VISIBLE_TOASTS = 4

function toneClass(tone: ToastTone): string {
  if (tone === 'success') return 'border-[rgba(var(--primary-rgb),0.5)] bg-[rgba(var(--primary-rgb),0.14)]'
  if (tone === 'warning') return 'border-[rgba(var(--warn-rgb),0.46)] bg-[rgba(var(--warn-rgb),0.14)]'
  if (tone === 'danger') return 'border-[rgba(var(--danger-rgb),0.48)] bg-[rgba(var(--danger-rgb),0.14)]'
  return 'border-[rgba(var(--info-rgb),0.52)] bg-[rgba(var(--info-rgb),0.14)]'
}

function toneToProgressIntent(tone: ToastTone): ProgressIntent {
  if (tone === 'success') return 'success'
  if (tone === 'warning') return 'warning'
  if (tone === 'danger') return 'warning'
  return 'momentum'
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

  const scheduleDismiss = useCallback(
    (id: string, durationMs?: number) => {
      const timeoutId = timeoutsRef.current.get(id)
      if (timeoutId) {
        window.clearTimeout(timeoutId)
        timeoutsRef.current.delete(id)
      }
      const nextDuration = durationMs ?? DEFAULT_DURATION_MS
      if (nextDuration <= 0) return
      const nextTimeout = window.setTimeout(() => {
        dismissToast(id)
      }, nextDuration)
      timeoutsRef.current.set(id, nextTimeout)
    },
    [dismissToast]
  )

  const showToast = useCallback(
    (input: ShowToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const next: ToastItem = {
        id,
        title: input.title,
        message: input.message,
        tone: input.tone ?? 'info',
        progress: input.progress
      }
      setToasts((current) => {
        if (current.length < MAX_VISIBLE_TOASTS) return [...current, next]
        const [oldest, ...rest] = current
        const timeoutId = timeoutsRef.current.get(oldest.id)
        if (timeoutId) {
          window.clearTimeout(timeoutId)
          timeoutsRef.current.delete(oldest.id)
        }
        return [...rest, next]
      })

      scheduleDismiss(id, input.durationMs)
      return id
    },
    [scheduleDismiss]
  )

  const updateToast = useCallback(
    (id: string, update: UpdateToastInput) => {
      setToasts((current) =>
        current.map((toast) => {
          if (toast.id !== id) return toast
          return {
            ...toast,
            title: update.title ?? toast.title,
            message: update.message ?? toast.message,
            tone: update.tone ?? toast.tone,
            progress:
              update.progress === undefined
                ? toast.progress
                : update.progress === null
                  ? undefined
                  : update.progress
          }
        })
      )

      if (update.durationMs !== undefined) {
        scheduleDismiss(id, update.durationMs)
      }
    },
    [scheduleDismiss]
  )

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current.values()) {
        window.clearTimeout(timeoutId)
      }
      timeoutsRef.current.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, updateToast, dismissToast }),
    [dismissToast, showToast, updateToast]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,26rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-left shadow-[var(--shadow1)] ${toneClass(toast.tone)}`}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{toast.title}</div>
            {toast.message ? <div className="mt-1 text-sm text-foreground">{toast.message}</div> : null}
            {toast.progress ? (
              <Progress
                value={toast.progress.value}
                intent={toast.progress.intent ?? toneToProgressIntent(toast.tone)}
                size="xs"
                className="mt-2"
              />
            ) : null}
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
    showToast: () => '',
    updateToast: () => {},
    dismissToast: () => {}
  }
}
