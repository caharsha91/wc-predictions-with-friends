import type { TableHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type TableProps = TableHTMLAttributes<HTMLTableElement>

export default function Table({ className, ...props }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        {...props}
        className={cn(
          'w-full border-collapse text-left text-sm',
          '[&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-muted-foreground',
          '[&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-3',
          className
        )}
      />
    </div>
  )
}
