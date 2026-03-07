import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PanelHeaderV2Props = {
  title: ReactNode
  subtitle?: ReactNode
  kicker?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
  contentClassName?: string
  divider?: boolean
}

export default function PanelHeaderV2({
  title,
  subtitle,
  kicker,
  meta,
  actions,
  className,
  contentClassName,
  divider = true
}: PanelHeaderV2Props) {
  return (
    <header className={cn(divider ? 'v2-panel-header' : undefined, className)}>
      <div className={cn('flex items-start justify-between gap-4', contentClassName)}>
        <div className="min-w-0 space-y-1">
          {kicker ? <div className="v2-panel-header-kicker v2-type-kicker">{kicker}</div> : null}
          <div className="v2-panel-header-title v2-type-body-md truncate font-semibold">{title}</div>
          {subtitle ? <div className="v2-panel-header-subtitle v2-type-caption">{subtitle}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {meta ? <div className="v2-panel-header-meta v2-type-caption mt-1.5">{meta}</div> : null}
    </header>
  )
}
