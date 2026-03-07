import type { HTMLAttributes, ReactNode } from 'react'

import { semanticSurfaceClass } from '../../lib/semanticState'
import { cn } from '../../lib/utils'

type StatusLineTone = 'neutral' | 'info' | 'success' | 'warning' | 'locked' | 'published'

type StatusLineV2Props = HTMLAttributes<HTMLDivElement> & {
  tone?: StatusLineTone
  icon?: ReactNode
  children: ReactNode
}

export default function StatusLineV2({ tone = 'neutral', icon, className, children, ...props }: StatusLineV2Props) {
  const toneClass =
    tone === 'success'
      ? semanticSurfaceClass('success')
      : tone === 'warning' || tone === 'locked'
        ? tone === 'locked'
          ? semanticSurfaceClass('locked')
          : semanticSurfaceClass('warning')
        : tone === 'info'
          ? semanticSurfaceClass('selection')
          : tone === 'published'
            ? semanticSurfaceClass('published')
          : 'border-border/80 bg-background/60 text-foreground'

  return (
    <div
      {...props}
      className={cn(
        'v2-status-line v2-type-meta flex min-h-10 items-start gap-2 rounded-xl border px-3 py-2',
        toneClass,
        className
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
