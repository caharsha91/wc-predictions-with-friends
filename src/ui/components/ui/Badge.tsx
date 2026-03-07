import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { semanticChipClass } from '../../lib/semanticState'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'v2-type-chip inline-flex items-center rounded-full border font-semibold shadow-[var(--shadow0)]',
  {
    variants: {
      tone: {
        default: 'border-border bg-bg2 text-fg1',
        success: semanticChipClass('success'),
        warning: semanticChipClass('warning'),
        danger: semanticChipClass('conflict'),
        info: semanticChipClass('selection'),
        secondary: semanticChipClass('rival'),
        locked: semanticChipClass('locked'),
        you: semanticChipClass('you'),
        rival: semanticChipClass('rival'),
        selection: semanticChipClass('selection'),
        published: semanticChipClass('published'),
        disabled: semanticChipClass('disabled')
      },
      size: {
        xs: 'h-[var(--v2-chip-height-sm)] px-[var(--v2-chip-pad-x-sm)] text-[var(--v2-chip-text-sm)]',
        sm: 'h-[var(--v2-chip-height-sm)] px-[var(--v2-chip-pad-x-sm)]',
        md: 'px-3 py-1.5 text-[length:var(--text-xs)] leading-none'
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
