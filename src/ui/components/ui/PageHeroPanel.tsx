import type { ReactNode } from 'react'

import AppMobileNav from '../AppMobileNav'
import { cn } from '../../lib/utils'

type PageHeroPanelProps = {
  kicker?: string
  title: string
  subtitle?: ReactNode
  meta?: ReactNode
  children?: ReactNode
  className?: string
  contentClassName?: string
  showMobileNav?: boolean
  mobileNav?: ReactNode
}

export default function PageHeroPanel({
  kicker,
  title,
  subtitle,
  meta,
  children,
  className,
  contentClassName,
  showMobileNav = true,
  mobileNav
}: PageHeroPanelProps) {
  return (
    <section
      className={cn(
        'rounded-3xl border border-[var(--page-header-border)] bg-[var(--page-header-bg)] shadow-[var(--shadow1)]',
        className
      )}
    >
      <div className="flex flex-col gap-4 px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {showMobileNav ? <div className="md:hidden">{mobileNav ?? <AppMobileNav />}</div> : null}
            <div className="min-w-0 space-y-2">
              {kicker ? (
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--page-header-kicker)]">
                  {kicker}
                </div>
              ) : null}
              <h1 className="text-2xl font-semibold uppercase tracking-[0.08em] text-[var(--page-header-title)] md:text-3xl">
                {title}
              </h1>
              {subtitle ? (
                <div className="text-sm text-[var(--page-header-subtitle)]">{subtitle}</div>
              ) : null}
            </div>
          </div>

          {meta ? (
            <div className="flex items-center gap-2 self-start text-[var(--page-header-subtitle)] [&_.text-foreground]:text-[var(--page-header-title)] [&_.text-muted-foreground]:text-[var(--page-header-subtitle)]">
              {meta}
            </div>
          ) : null}
        </div>
      </div>

      {children ? (
        <div className={cn('border-t border-border/70 px-5 py-5 md:px-6 md:py-6', contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
