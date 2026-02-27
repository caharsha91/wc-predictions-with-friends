import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border font-semibold shadow-[var(--shadow0)]',
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
      },
      size: {
        xs: 'h-[var(--v2-chip-height-sm)] px-[var(--v2-chip-pad-x-sm)] text-[var(--v2-chip-text-sm)]',
        sm: 'px-2.5 py-1 text-[12px]',
        md: 'px-3 py-1.5 text-[12px]'
      },
      case: {
        normal: 'normal-case tracking-normal',
        upper: 'uppercase tracking-[0.12em]'
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
