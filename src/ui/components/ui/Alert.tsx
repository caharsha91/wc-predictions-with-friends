import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const alertVariants = cva('rounded-lg border px-4 py-3 text-sm shadow-soft', {
  variants: {
    tone: {
      info: 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground',
      success: 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground',
      warning: 'border-[var(--border-warning)] bg-[var(--banner-accent)] text-foreground',
      danger: 'border-[var(--border-danger)] bg-[var(--accent-soft)] text-foreground'
    }
  },
  defaultVariants: {
    tone: 'info'
  }
})

type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    title?: ReactNode
    children: ReactNode
  }

export function Alert({ tone, title, children, className, ...props }: AlertProps) {
  return (
    <div
      {...props}
      className={cn(alertVariants({ tone }), className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <div className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</div> : null}
      <div>{children}</div>
    </div>
  )
}
