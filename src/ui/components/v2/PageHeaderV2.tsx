import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import V2Card from './V2Card'

export type PageHeaderV2Variant = 'hero' | 'section'

type PageHeaderV2Props = {
  title: string
  subtitle?: ReactNode
  kicker?: ReactNode
  actions?: ReactNode
  metadata?: ReactNode
  metadataClassName?: string
  className?: string
  variant?: PageHeaderV2Variant
}

export default function PageHeaderV2({
  title,
  subtitle,
  kicker,
  actions,
  metadata,
  metadataClassName,
  className,
  variant = 'section'
}: PageHeaderV2Props) {
  const isHero = variant === 'hero'

  return (
    <V2Card tone={isHero ? 'hero' : 'panel'} className={cn('v2-page-header overflow-hidden', className)}>
      <div className={cn('flex flex-col gap-4', isHero ? 'px-5 py-5 md:px-6 md:py-6' : 'px-4 py-4 md:px-5 md:py-5')}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className={cn('min-w-0', isHero ? 'space-y-2' : 'space-y-1.5')}>
            {kicker ? (
              <div
                className={cn(
                  'uppercase text-[var(--page-header-kicker)]',
                  isHero ? 'text-xs tracking-[0.24em]' : 'text-[11px] tracking-[0.2em]'
                )}
              >
                {kicker}
              </div>
            ) : null}
            <h1
              className={cn(
                'text-[var(--page-header-title)]',
                isHero ? 'text-[length:var(--v2-h1-size)]' : 'text-[length:var(--v2-h2-size)]'
              )}
              style={{
                fontFamily: 'var(--font-display)',
                lineHeight: 'var(--line-height-tight)',
                fontWeight: 'var(--font-weight-semibold)',
                letterSpacing: '0.01em'
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p
                className="text-[var(--page-header-subtitle)]"
                style={{
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--line-height-body)'
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2 self-start md:pt-0.5">{actions}</div> : null}
        </div>
        {metadata ? (
          <div
            className={cn(
              'v2-page-header-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground',
              metadataClassName
            )}
          >
            {metadata}
          </div>
        ) : null}
      </div>
    </V2Card>
  )
}
