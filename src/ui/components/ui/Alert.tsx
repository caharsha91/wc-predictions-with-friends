import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const alertVariants = cva('rounded-[var(--v2-control-radius-lg)] border px-4 py-3 text-sm shadow-[var(--shadow0)]', {
  variants: {
    tone: {
      info: 'border-[color:var(--tone-info-border)] bg-[color:var(--tone-info-bg)] text-foreground',
      success: 'border-[color:var(--tone-success-border)] bg-[color:var(--tone-success-bg)] text-foreground',
      warning: 'border-[color:var(--tone-warning-border)] bg-[color:var(--tone-warning-bg)] text-foreground',
      danger: 'border-[color:var(--tone-danger-border)] bg-[color:var(--tone-danger-bg)] text-foreground'
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
      {title ? <div className="mb-1 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">{title}</div> : null}
      <div>{children}</div>
    </div>
  )
}
