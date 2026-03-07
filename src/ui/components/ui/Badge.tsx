import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'v2-type-chip inline-flex items-center rounded-full border font-semibold shadow-[var(--shadow0)]',
  {
    variants: {
      tone: {
        default: 'border-border bg-bg2 text-fg1',
        success: 'border-[color:var(--tone-success-border)] bg-[color:var(--tone-success-bg)] text-foreground',
        warning: 'border-[color:var(--tone-warning-border)] bg-[color:var(--tone-warning-bg)] text-foreground',
        danger: 'border-[color:var(--tone-danger-border)] bg-[color:var(--tone-danger-bg)] text-foreground',
        info: 'border-[color:var(--tone-info-border)] bg-[color:var(--tone-info-bg)] text-foreground',
        secondary: 'border-[color:var(--tone-secondary-border)] bg-[color:var(--tone-secondary-bg)] text-foreground',
        locked: 'border-[color:var(--tone-warning-border)] bg-[color:var(--tone-warning-bg)] text-foreground'
      },
      size: {
        xs: 'h-[var(--v2-chip-height-sm)] px-[var(--v2-chip-pad-x-sm)] text-[var(--v2-chip-text-sm)]',
        sm: 'h-[var(--v2-chip-height-sm)] px-[var(--v2-chip-pad-x-sm)]',
        md: 'px-3 py-1.5 text-[12px] leading-none'
      },
      case: {
        normal: 'normal-case tracking-normal',
        upper: 'uppercase v2-track-12'
      }
    },
    defaultVariants: {
      tone: 'default',
      size: 'sm',
      case: 'upper'
    }
  }
)

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    children: ReactNode
  }

export function Badge({ tone, size, case: caseVariant, children, className, ...props }: BadgeProps) {
  return (
    <span {...props} className={cn(badgeVariants({ tone, size, case: caseVariant }), className)}>
      {children}
    </span>
  )
}
