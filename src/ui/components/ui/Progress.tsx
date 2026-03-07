import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../lib/utils'

const progressRootVariants = cva('relative w-full overflow-hidden rounded-full border bg-[var(--surface-muted)]', {
  variants: {
    intent: {
      default: 'border-[color:var(--hl-selection-border)]',
      momentum: 'border-[color:var(--hl-selection-border)] shadow-[inset_0_0_0_1px_var(--hl-selection-border-soft)]',
      warning: 'border-[color:var(--hl-warning-border)]',
      success: 'border-[color:var(--hl-success-border)]'
    },
    size: {
      xs: 'h-1.5',
      sm: 'h-2',
      md: 'h-2.5'
    }
  },
  defaultVariants: {
    intent: 'default',
    size: 'md'
  }
})

const progressIndicatorVariants = cva('h-full w-full transition-transform duration-300 ease-out', {
  variants: {
    intent: {
      default: 'bg-[color:var(--hl-selection-border)]',
      momentum: 'bg-[color:var(--hl-selection-border)]',
      warning: 'bg-[color:var(--hl-warning-border)]',
      success: 'bg-[color:var(--hl-success-border)]'
    }
  },
  defaultVariants: {
    intent: 'default'
  }
})

export type ProgressIntent = NonNullable<VariantProps<typeof progressRootVariants>['intent']>

type ProgressProps = Omit<ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>, 'value' | 'max'> &
  VariantProps<typeof progressRootVariants> & {
    value: number
    max?: number
    indicatorClassName?: string
  }

export default function Progress({
  value,
  max = 100,
  intent,
  size,
  className,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(max, value))
  const percentage = max > 0 ? Math.round((clampedValue / max) * 100) : 0

  return (
    <ProgressPrimitive.Root
      value={clampedValue}
      max={max}
      className={cn(progressRootVariants({ intent, size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(progressIndicatorVariants({ intent }), indicatorClassName)}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
