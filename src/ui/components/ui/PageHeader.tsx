import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PageHeaderProps = {
  kicker?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export default function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  className
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-3xl border border-[var(--page-header-border)] bg-[var(--page-header-bg)] px-5 py-5 shadow-[var(--shadow1)] md:flex-row md:items-end md:justify-between md:px-6 md:py-6',
        className
      )}
    >
      <div className="space-y-2">
        {kicker ? (
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--page-header-kicker)]">
            {kicker}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold uppercase tracking-[0.08em] text-[var(--page-header-title)] md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <div className="text-sm text-[var(--page-header-subtitle)]">{subtitle}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 self-start text-[var(--page-header-subtitle)] [&_.text-foreground]:text-[var(--page-header-title)] [&_.text-muted-foreground]:text-[var(--page-header-subtitle)] md:self-auto">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
