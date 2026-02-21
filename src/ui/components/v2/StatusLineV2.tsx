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
      ? 'border-[rgba(var(--primary-rgb),0.46)] bg-[rgba(var(--primary-rgb),0.12)] text-foreground'
      : tone === 'warning' || tone === 'locked'
        ? 'border-[rgba(var(--warn-rgb),0.48)] bg-[rgba(var(--warn-rgb),0.14)] text-foreground'
        : tone === 'info'
          ? 'border-[rgba(var(--info-rgb),0.48)] bg-[rgba(var(--info-rgb),0.12)] text-foreground'
          : 'border-border/80 bg-background/60 text-foreground'

  return (
    <div
      {...props}
      className={cn(
        'v2-status-line flex min-h-10 items-start gap-2 rounded-xl border px-3 py-2 text-[13px] leading-[1.35] md:text-[14px]',
        toneClass,
        className
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
