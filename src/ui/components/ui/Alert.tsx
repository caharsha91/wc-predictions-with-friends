import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { semanticSurfaceClass } from '../../lib/semanticState'
import { cn } from '../../lib/utils'

const alertVariants = cva('rounded-[var(--v2-control-radius-lg)] border px-4 py-3 text-sm shadow-[var(--shadow0)]', {
  variants: {
    tone: {
      info: semanticSurfaceClass('selection'),
      success: semanticSurfaceClass('success'),
      warning: semanticSurfaceClass('warning'),
      danger: semanticSurfaceClass('conflict')
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
      {title ? <div className="v2-type-kicker mb-1">{title}</div> : null}
      <div>{children}</div>
    </div>
  )
}
