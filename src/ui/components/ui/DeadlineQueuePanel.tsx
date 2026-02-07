import { Badge } from './Badge'
import { Button } from './Button'
import { Card } from './Card'

export type DeadlineQueueItem = {
  id: string
  label: string
  subline?: string
  status: string
}

type DeadlineQueuePanelProps = {
  items: DeadlineQueueItem[]
  onOpenItem?: (id: string) => void
  pageSize?: number
  emptyMessage?: string
}

/**
 * Presentational queue panel for pre-sorted deadline items.
 * This component must not compute priorities or lock logic.
 */
export default function DeadlineQueuePanel({
  items,
  onOpenItem,
  pageSize = 10,
  emptyMessage = 'No upcoming deadlines.'
}: DeadlineQueuePanelProps) {
  const visibleItems = items.slice(0, pageSize)

  return (
    <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Deadline queue</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Upcoming lock windows sorted by urgency.
          </div>
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
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border/70 bg-bg2 p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  {item.subline ? <div className="text-xs text-muted-foreground">{item.subline}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">{item.status}</Badge>
                  {onOpenItem ? (
                    <Button size="sm" variant="secondary" onClick={() => onOpenItem(item.id)}>
                      Open
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
