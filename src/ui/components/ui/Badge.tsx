import type { HTMLAttributes, ReactNode } from 'react'

export type BadgeTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'locked'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  children: ReactNode
}

export function Badge({ tone = 'default', children, className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={['badge', className].filter(Boolean).join(' ')}
      data-tone={tone === 'default' ? undefined : tone}
    >
      {children}
    </span>
  )
}
