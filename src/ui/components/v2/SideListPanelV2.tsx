import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import SectionCardV2 from './SectionCardV2'
import PanelHeaderV2 from './PanelHeaderV2'

type SideListPanelV2Props = {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  headerClassName?: string
}

export default function SideListPanelV2({
  title,
  subtitle,
  meta,
  actions,
  children,
  footer,
  className,
  contentClassName,
  headerClassName
}: SideListPanelV2Props) {
  return (
    <SectionCardV2 role="side" density="none" className={cn('overflow-hidden rounded-xl', className)}>
      <PanelHeaderV2
        title={title}
        subtitle={subtitle}
        meta={meta}
        actions={actions}
        className={cn('px-3 py-2.5', headerClassName)}
        divider
      />
      <div className={cn('space-y-1 p-2.5', contentClassName)}>{children}</div>
      {footer ? <div className="border-t border-[var(--divider)] px-3 py-2">{footer}</div> : null}
    </SectionCardV2>
  )
}
