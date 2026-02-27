import type { TableHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  containerClassName?: string
  unframed?: boolean
}

export default function Table({ className, containerClassName, unframed = false, ...props }: TableProps) {
  return (
    <div
      className={cn(
        'w-full min-w-0 overflow-x-auto',
        unframed ? null : 'rounded-lg border border-border/55 bg-card/95 shadow-[var(--shadow0)]',
        containerClassName
      )}
    >
      <table
        {...props}
        className={cn(
          'w-full border-collapse text-left text-sm',
          '[&_th]:border-b [&_th]:border-border/50 [&_th]:bg-bg2/30 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[12px] [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-muted-foreground',
          '[&_td]:border-b [&_td]:border-border/35 [&_td]:px-3 [&_td]:py-3.5',
          '[&_tbody_tr:hover]:bg-bg2/24 [&_tbody_tr]:transition-colors',
          '[&_tr:last-child_td]:border-b-0',
          className
        )}
      />
    </div>
  )
}
