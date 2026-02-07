import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Badge } from './Badge'
import { Button } from './Button'

export type ActionStatusChip = {
  type: 'deadline' | 'unlock' | 'lastSubmitted'
  text: string
}

export type ActionSummaryMetric = {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'locked'
}

export type ActionSummaryAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}

export type ActionSummaryStripProps = {
  headline: string
  subline?: ReactNode
  progress?: {
    label: string
    current: number
    total: number
  }
  metrics: ActionSummaryMetric[]
  statusChip: ActionStatusChip
  primaryAction: ActionSummaryAction
  secondaryAction?: ActionSummaryAction
  className?: string
}

function statusChipTone(type: ActionStatusChip['type']) {
  if (type === 'deadline') return 'warning'
  if (type === 'unlock') return 'info'
  return 'secondary'
}

/**
 * Presentational summary strip for action-first pages.
 * This component must remain UI-only and must not contain picks, bracket, or resolver logic.
 */
export default function ActionSummaryStrip({
  headline,
  subline,
  progress,
  metrics,
  statusChip,
  primaryAction,
  secondaryAction,
  className
}: ActionSummaryStripProps) {
  const progressPct =
    progress && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100))) : 0

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xl font-semibold text-foreground">{headline}</div>
          {subline ? <div className="text-sm text-muted-foreground">{subline}</div> : null}
        </div>
        <Badge tone={statusChipTone(statusChip.type)}>
          {statusChip.type === 'deadline' ? 'Deadline' : statusChip.type === 'unlock' ? 'Unlock' : 'Last submitted'}{' '}
          {statusChip.text}
        </Badge>
      </div>

      {progress ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.label}</span>
            <span>
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-bg2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground">{progressPct}% complete</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {metrics.map((metric) => (
          <Badge key={metric.label} tone={metric.tone ?? 'secondary'}>
            {metric.label} {metric.value}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          loading={primaryAction.loading}
        >
          {primaryAction.label}
        </Button>
        {secondaryAction ? (
          <Button
            variant="secondary"
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            loading={secondaryAction.loading}
          >
            {secondaryAction.label}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
