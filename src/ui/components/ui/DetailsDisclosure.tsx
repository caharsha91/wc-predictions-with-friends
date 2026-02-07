import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

type DetailsDisclosureProps = {
  title: string
  defaultOpen?: boolean
  meta?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Presentational disclosure for non-urgent details.
 * This component must not own data fetching, mutations, or domain decisions.
 */
export default function DetailsDisclosure({
  title,
  defaultOpen = false,
  meta,
  children,
  className
}: DetailsDisclosureProps) {
  return (
    <details
      open={defaultOpen}
      className={cn('rounded-2xl border border-border/60 bg-card p-4 sm:p-5', className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
        <span>{title}</span>
        {meta ? <span className="text-xs normal-case tracking-normal text-muted-foreground">{meta}</span> : null}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}
