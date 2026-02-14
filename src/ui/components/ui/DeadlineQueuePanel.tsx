import { useEffect, useMemo, useState } from 'react'

import { Badge } from './Badge'
import { Button } from './Button'
import { Card } from './Card'

export type DeadlineQueueItem = {
  id: string
  label: string
  subline?: string
  status: string
  statusTone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'locked'
  actionLabel?: string
  actionDisabled?: boolean
}

type DeadlineQueuePanelProps = {
  items: DeadlineQueueItem[]
  onOpenItem?: (id: string) => void
  onSelectItem?: (id: string) => void
  pageSize?: number
  emptyMessage?: string
  container?: 'card' | 'inline'
  heading?: string
  description?: string
  selectedItemId?: string
  paginationKey?: string
}

/**
 * Presentational queue panel for pre-sorted deadline items.
 * This component must not compute priorities or lock logic.
 */
export default function DeadlineQueuePanel({
  items,
  onOpenItem,
  onSelectItem,
  pageSize = 10,
  emptyMessage = 'Nothing closing soon. Enjoy the calm.',
  container = 'card',
  heading = 'Closing soon',
  description = 'Tap a match to jump in.',
  selectedItemId,
  paginationKey
}: DeadlineQueuePanelProps) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const [page, setPage] = useState(1)
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const visibleItems = useMemo(
    () => items.slice(pageStart, pageStart + pageSize),
    [items, pageSize, pageStart]
  )
  const selectItem = onSelectItem ?? onOpenItem

  useEffect(() => {
    setPage(1)
  }, [paginationKey])

  useEffect(() => {
    if (safePage === page) return
    setPage(safePage)
  }, [page, safePage])

  const canPaginate = items.length > pageSize
  const content = (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{heading}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3 ${
                selectedItemId === item.id
                  ? 'border-primary/70 bg-[rgba(var(--primary-rgb),0.12)]'
                  : 'border-border/70 bg-bg2'
              } ${selectItem && !item.actionDisabled ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-bg2' : ''}`}
              role={selectItem && !item.actionDisabled ? 'button' : undefined}
              tabIndex={selectItem && !item.actionDisabled ? 0 : undefined}
              aria-disabled={item.actionDisabled ? true : undefined}
              onClick={() => {
                if (!selectItem || item.actionDisabled) return
                selectItem(item.id)
              }}
              onKeyDown={(event) => {
                if (!selectItem || item.actionDisabled) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  selectItem(item.id)
                }
              }}
            >
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold text-foreground">{item.label}</div>
                {item.subline ? <div className="text-xs text-muted-foreground">{item.subline}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={item.statusTone ?? 'warning'}>{item.status}</Badge>
                {selectItem ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={item.actionDisabled}
                    onClick={(event) => {
                      event.stopPropagation()
                      selectItem(item.id)
                    }}
                  >
                    {item.actionLabel ?? 'Open'}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {canPaginate ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
          <div className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
            >
              First
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )

  if (container === 'inline') return content

  return <Card className="rounded-2xl border-border/60 p-4 sm:p-5">{content}</Card>
}
