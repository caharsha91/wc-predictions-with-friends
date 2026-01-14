import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
  {
    variants: {
      tone: {
        default: 'border-border/70 bg-[var(--surface-muted)] text-muted-foreground',
        success: 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground',
        warning: 'border-[var(--border-warning)] bg-[var(--banner-accent)] text-foreground',
        danger: 'border-[var(--border-danger)] bg-[var(--accent-soft)] text-foreground',
        info: 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground',
        secondary:
          'border-[rgba(var(--color-accent-2-rgb),var(--border-accent-alpha))] bg-[rgba(var(--color-accent-2-rgb),var(--accent-soft-alpha))] text-foreground',
        locked: 'border-[var(--border-warning)] bg-[var(--banner-accent)] text-foreground'
      }
    },
    defaultVariants: {
      tone: 'default'
    }
  }
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    children: ReactNode
  }

export function Badge({ tone, children, className, ...props }: BadgeProps) {
  return (
    <span {...props} className={cn(badgeVariants({ tone }), className)}>
      {children}
    </span>
  )
}
