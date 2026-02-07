import type { ReactNode } from 'react'

import type { PlayCenterState } from '../../lib/nextActionResolver'
import { cn } from '../../lib/utils'
import ActionSummaryStrip, { type ActionSummaryStripProps } from './ActionSummaryStrip'
import { Badge } from './Badge'
import { Card } from './Card'
import PageHeroPanel from './PageHeroPanel'

type PlayCenterHeroProps = {
  title: string
  subtitle?: ReactNode
  lastUpdatedUtc?: string
  state: PlayCenterState
  summary: ActionSummaryStripProps
  sidePanel?: ReactNode
  className?: string
}

function formatLastUpdated(utcIso?: string) {
  if (!utcIso) return '—'
  return new Date(utcIso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function stateTone(state: PlayCenterState) {
  if (state === 'READY_OPEN_PICKS' || state === 'READY_OPEN_BRACKET') return 'success'
  if (state === 'READY_RESULTS') return 'info'
  if (state === 'READY_LOCKED_WAITING') return 'warning'
  if (state === 'ERROR') return 'danger'
  return 'secondary'
}

function stateLabel(state: PlayCenterState) {
  if (state === 'READY_OPEN_PICKS') return 'Open picks'
  if (state === 'READY_OPEN_BRACKET') return 'Open bracket'
  if (state === 'READY_RESULTS') return 'Review results'
  if (state === 'READY_LOCKED_WAITING') return 'Locked / waiting'
  if (state === 'READY_IDLE') return 'Idle'
  if (state === 'ERROR') return 'Error'
  return 'Loading'
}

/**
 * Presentational hero wrapper for Play Center pages.
 * This component must not fetch data or resolve next actions.
 */
export default function PlayCenterHero({
  title,
  subtitle,
  lastUpdatedUtc,
  state,
  summary,
  sidePanel,
  className
}: PlayCenterHeroProps) {
  return (
    <PageHeroPanel
      kicker="Play center"
      title={title}
      subtitle={subtitle}
      className={cn('space-y-0', className)}
      meta={
        <div className="flex flex-col items-end gap-2 text-right">
          <div data-last-updated className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatLastUpdated(lastUpdatedUtc)}</div>
          </div>
          <Badge tone={stateTone(state)}>{stateLabel(state)}</Badge>
        </div>
      }
      contentClassName="pt-4"
    >
      <div className={cn('grid gap-4', sidePanel ? 'xl:grid-cols-[1.45fr_0.55fr]' : undefined)}>
        <ActionSummaryStrip {...summary} />
        {sidePanel ? (
          <Card className="rounded-2xl border-border/60 bg-bg2 p-4 sm:p-5">{sidePanel}</Card>
        ) : null}
      </div>
    </PageHeroPanel>
  )
}
