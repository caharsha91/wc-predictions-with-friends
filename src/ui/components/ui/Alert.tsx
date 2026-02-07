import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const alertVariants = cva('rounded-lg border px-4 py-3 text-sm shadow-[var(--shadow0)]', {
  variants: {
    tone: {
      info: 'border-[rgba(var(--info-rgb),0.52)] bg-[rgba(var(--info-rgb),0.14)] text-foreground',
      success:
        'border-[rgba(var(--primary-rgb),0.5)] bg-[rgba(var(--primary-rgb),0.14)] text-foreground',
      warning:
        'border-[rgba(var(--warn-rgb),0.46)] bg-[rgba(var(--warn-rgb),0.14)] text-foreground',
      danger:
        'border-[rgba(var(--danger-rgb),0.48)] bg-[rgba(var(--danger-rgb),0.14)] text-foreground'
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
