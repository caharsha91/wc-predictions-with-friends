import { Fragment, type ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PageHeaderMetadataV2Props = {
  items: ReactNode[]
  className?: string
  itemClassName?: string
}

export default function PageHeaderMetadataV2({
  items,
  className,
  itemClassName
}: PageHeaderMetadataV2Props) {
  const visibleItems = items.filter((item) => item !== null && item !== undefined && item !== false)

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5', className)}>
      {visibleItems.map((item, index) => (
        <Fragment key={`page-header-meta-item-${index}`}>
          <span className={cn('inline-flex items-center', itemClassName)}>{item}</span>
          {index < visibleItems.length - 1 ? (
            <span className="h-3 w-px bg-border" aria-hidden="true" />
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
