import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type StatusLineTone = 'neutral' | 'info' | 'success' | 'warning' | 'locked'

type StatusLineV2Props = HTMLAttributes<HTMLDivElement> & {
  tone?: StatusLineTone
  icon?: ReactNode
  children: ReactNode
}

export default function StatusLineV2({ tone = 'neutral', icon, className, children, ...props }: StatusLineV2Props) {
  const toneClass =
    tone === 'success'
      ? 'border-[color:var(--tone-success-border)] bg-[color:var(--tone-success-bg-soft)] text-foreground'
      : tone === 'warning' || tone === 'locked'
        ? 'border-[color:var(--tone-warning-border)] bg-[color:var(--tone-warning-bg)] text-foreground'
        : tone === 'info'
          ? 'border-[color:var(--tone-info-border)] bg-[color:var(--tone-info-bg-soft)] text-foreground'
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
