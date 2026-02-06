import type { TableHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type TableProps = TableHTMLAttributes<HTMLTableElement>

export default function Table({ className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card shadow-[var(--shadow0)]">
      <table
        {...props}
        className={cn(
          'w-full border-collapse text-left text-sm',
          '[&_th]:border-b [&_th]:border-border [&_th]:bg-bg2/50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-muted-foreground',
          '[&_td]:border-b [&_td]:border-border/70 [&_td]:px-3 [&_td]:py-3',
          '[&_tbody_tr:hover]:bg-bg2/50 [&_tbody_tr]:transition-colors',
          '[&_tr:last-child_td]:border-b-0',
          className
        )}
      />
    </div>
  )
}
