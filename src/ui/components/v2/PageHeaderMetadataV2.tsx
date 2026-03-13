import { Fragment, type ReactNode } from 'react'

import { cn } from '../../lib/utils'

export type PageHeaderMetadataItem = {
  key?: string
  content: ReactNode
}

type PageHeaderMetadataV2Props = {
  items: Array<ReactNode | PageHeaderMetadataItem>
  className?: string
  itemClassName?: string
}

export default function PageHeaderMetadataV2({
  items,
  className,
  itemClassName
}: PageHeaderMetadataV2Props) {
  const visibleItems = items
    .map((item, index) => {
      if (item !== null && item !== undefined && item !== false && typeof item === 'object' && 'content' in item) {
        return { key: item.key ?? `page-header-meta-item-${index}`, content: item.content }
      }
      return { key: `page-header-meta-item-${index}`, content: item }
    })
    .filter(({ content }) => content !== null && content !== undefined && content !== false)

  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1.5', className)}>
      {visibleItems.map((item, index) => (
        <Fragment key={item.key}>
          <span className={cn('inline-flex items-center', itemClassName)}>{item.content}</span>
          {index < visibleItems.length - 1 ? (
            <span className="h-3 w-px bg-border" aria-hidden="true" />
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
