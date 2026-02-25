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
      <div className={cn('flex items-start justify-between gap-3', contentClassName)}>
        <div className="min-w-0">
          {kicker ? <div className="v2-panel-header-kicker text-[11px] font-semibold uppercase tracking-[0.16em]">{kicker}</div> : null}
          <div className="v2-panel-header-title truncate text-[15px] font-semibold">{title}</div>
          {subtitle ? <div className="v2-panel-header-subtitle mt-0.5 text-[12px]">{subtitle}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {meta ? <div className="v2-panel-header-meta mt-1 text-[12px]">{meta}</div> : null}
    </header>
  )
}
