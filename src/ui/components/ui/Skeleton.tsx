import type { CSSProperties, HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: CSSProperties['width']
  height?: CSSProperties['height']
}

export default function Skeleton({ width, height, style, className, ...props }: SkeletonProps) {
  return (
    <span
      {...props}
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}
