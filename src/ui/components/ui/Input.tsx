import * as React from 'react'

import { cn } from '../../lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'w-full rounded-md border border-transparent bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground shadow-[inset_0_0_0_1px_var(--border-subtle)] placeholder:text-fg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-[inset_0_0_0_1px_var(--focus-ring-strong)] disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
