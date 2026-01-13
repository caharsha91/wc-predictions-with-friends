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
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="space-y-2">
        {kicker ? (
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {kicker}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold uppercase tracking-[0.08em] text-foreground md:text-3xl">
          {title}
        </h1>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
