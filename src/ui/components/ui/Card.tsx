import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  as?: 'section' | 'div' | 'article'
}

type CardHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Card({ children, className, as: Tag = 'section', ...props }: CardProps) {
  return (
    <Tag
      {...props}
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow1)]',
        className
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, actions, children }: CardHeaderProps) {
  if (children) {
    return <div className="flex items-start justify-between gap-4 border-b border-border p-4">{children}</div>
  }
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border p-4">
      <div className="space-y-1">
        {title ? <div className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</div> : null}
        {subtitle ? <div className="text-base text-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ children, className, ...props }: CardSectionProps) {
  return (
    <div {...props} className={cn('p-4', className)}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className, ...props }: CardSectionProps) {
  return (
    <div {...props} className={cn('flex items-center justify-between gap-3 border-t border-border p-4', className)}>
      {children}
    </div>
  )
}
