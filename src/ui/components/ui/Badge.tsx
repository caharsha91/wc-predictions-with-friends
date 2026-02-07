import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-[var(--shadow0)]',
  {
    variants: {
      tone: {
        default: 'border-border bg-bg2 text-fg1',
        success: 'border-[rgba(var(--primary-rgb),0.5)] bg-[rgba(var(--primary-rgb),0.16)] text-foreground',
        warning: 'border-[rgba(var(--warn-rgb),0.46)] bg-[rgba(var(--warn-rgb),0.14)] text-foreground',
        danger: 'border-[rgba(var(--danger-rgb),0.48)] bg-[rgba(var(--danger-rgb),0.14)] text-foreground',
        info: 'border-[rgba(var(--info-rgb),0.54)] bg-[rgba(var(--info-rgb),0.16)] text-foreground',
        secondary:
          'border-[rgba(var(--secondary-rgb),0.52)] bg-[rgba(var(--secondary-rgb),0.14)] text-foreground',
        locked: 'border-[rgba(var(--warn-rgb),0.46)] bg-[rgba(var(--warn-rgb),0.14)] text-foreground'
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
