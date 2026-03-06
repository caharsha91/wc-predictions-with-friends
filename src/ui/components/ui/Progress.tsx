import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../lib/utils'

const progressRootVariants = cva('relative w-full overflow-hidden rounded-full border bg-[var(--surface-muted)]', {
  variants: {
    intent: {
      default: 'border-[color:var(--tone-info-border)]',
      momentum: 'border-[color:var(--tone-momentum-border)] shadow-[0_0_0_1px_var(--tone-momentum-border),0_0_16px_var(--glow)]',
      warning: 'border-[color:var(--tone-warning-border)]',
      success: 'border-[color:var(--tone-success-border)]'
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
      default: 'bg-[color:var(--tone-info-border)]',
      momentum: 'bg-[color:var(--tone-momentum-bg)] shadow-[var(--tone-momentum-glow)]',
      warning: 'bg-[color:var(--tone-warning-border)]',
      success: 'bg-[color:var(--tone-success-border)]'
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
