import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PanelTone = 'loading' | 'empty' | 'error'

const panelStateVariants = cva('rounded-xl border p-3 text-sm', {
  variants: {
    tone: {
      loading: 'border-border/70 bg-bg2/40 text-muted-foreground',
      empty: 'border-dashed border-border/70 bg-transparent text-muted-foreground',
      error: 'border-[var(--border-danger)] bg-[var(--status-danger-soft)] text-foreground'
    }
  },
  defaultVariants: {
    tone: 'empty'
  }
})

type PanelStateProps = {
  title?: string
  message: ReactNode
  tone?: PanelTone
  className?: string
  messageClassName?: string
}

export default function PanelState({ title, message, tone = 'empty', className, messageClassName }: PanelStateProps) {
  return (
    <div className={cn(panelStateVariants({ tone }), className)}>
      {title ? <div className="font-semibold text-foreground">{title}</div> : null}
      <div className={cn(title ? 'mt-1' : undefined, messageClassName)}>{message}</div>
    </div>
  )
}
