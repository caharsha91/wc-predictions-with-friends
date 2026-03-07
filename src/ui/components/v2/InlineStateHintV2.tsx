import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type InlineStateHintV2Props = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
}

export default function InlineStateHintV2({
  children,
  className,
  ...props
}: InlineStateHintV2Props) {
  return (
    <span
      {...props}
      className={cn('v2-type-chip inline-flex items-center gap-1 text-muted-foreground', className)}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border/70" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  )
}
