import type { MutableRefObject } from 'react'

import { Badge } from './ui/Badge'
import { Card } from './ui/Card'
import type { ProjectedImpactRow } from '../lib/projectedImpact'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'

function rankMovementLabel(deltaRank: number): string {
  if (deltaRank > 0) return `↑ ${deltaRank}`
  if (deltaRank < 0) return `↓ ${Math.abs(deltaRank)}`
  return '—'
}

export default function ProjectedImpactPanel({
  rows,
  snapshotTimestamp,
  panelRef
}: {
  rows: ProjectedImpactRow[]
  snapshotTimestamp: string
  panelRef?: MutableRefObject<HTMLDivElement | null>
}) {
  const sortedRows = [...rows].sort((a, b) => {
    if (a.isYou !== b.isYou) return a.isYou ? -1 : 1
    return a.projectedRank - b.projectedRank
  })

  return (
    <div ref={panelRef} tabIndex={-1} className="outline-none">
    <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-foreground">Projected Impact</div>
          <Badge tone="info">Projected</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          As of {formatSnapshotTimestamp(snapshotTimestamp)} · Updates daily
        </div>
        <div className="max-h-[calc(100vh-16rem)] space-y-2 overflow-y-auto pr-1">
          {sortedRows.slice(0, 12).map((row) => (
            <div
              key={`impact-${row.userId}`}
              className={`rounded-xl border px-3 py-2 ${
                row.isYou
                  ? 'border-[var(--border-accent)] bg-[var(--accent-soft)]/45'
                  : 'border-border/70 bg-bg2/35'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                  #{row.projectedRank} {row.name}
                </div>
                {row.isYou ? <Badge tone="info">You</Badge> : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/90">
                <span className="min-w-0 truncate">
                  Base #{row.baseRank} · Move {rankMovementLabel(row.deltaRank)}
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {row.deltaPoints >= 0 ? '+' : ''}
                  {row.deltaPoints} pts
                </span>
              </div>
            </div>
          ))}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border/70 bg-bg2/30 px-3 py-2 text-xs text-muted-foreground">
              No projected movement available in this snapshot.
            </div>
          ) : null}
        </div>
      </div>
    </Card>
    </div>
  )
}
