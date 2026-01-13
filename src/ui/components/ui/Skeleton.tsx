import type { CSSProperties, HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
}

export default function Skeleton({ width, height, style, className, ...props }: SkeletonProps) {
  return (
    <span
      {...props}
      className={cn(
        'block h-4 w-full animate-pulse rounded-md bg-[var(--surface-muted)]',
        className
      )}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}
