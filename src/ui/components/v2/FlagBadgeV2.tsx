import { useEffect, useMemo, useState } from 'react'

import { cn } from '../../lib/utils'

export type FlagBadgeSize = 'xs' | 'sm' | 'md'

type FlagBadgeV2Props = {
  src: string
  fallbackSrc: string
  size?: FlagBadgeSize
  className?: string
  imageClassName?: string
}

const SIZE_CLASS_BY_VARIANT: Record<FlagBadgeSize, string> = {
  xs: 'h-3 w-4',
  sm: 'h-3.5 w-4.5',
  md: 'h-4 w-5'
}

export default function FlagBadgeV2({
  src,
  fallbackSrc,
  size = 'md',
  className,
  imageClassName
}: FlagBadgeV2Props) {
  const candidates = useMemo(
    () => (src === fallbackSrc ? [src] : [src, fallbackSrc]),
    [fallbackSrc, src]
  )
  const [failedCandidateIndex, setFailedCandidateIndex] = useState(0)

  useEffect(() => {
    setFailedCandidateIndex(0)
  }, [candidates])

  const activeSrc = failedCandidateIndex < candidates.length ? candidates[failedCandidateIndex] : null

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border/70 bg-background/70',
        SIZE_CLASS_BY_VARIANT[size],
        className
      )}
    >
      {activeSrc ? (
        <img
          src={activeSrc}
          alt=""
          aria-hidden="true"
          className={cn('h-full w-full object-cover', imageClassName)}
          loading="lazy"
          decoding="async"
          onError={() => setFailedCandidateIndex((current) => current + 1)}
        />
      ) : (
        <span aria-hidden="true" className="text-[10px] font-semibold text-muted-foreground">
          ?
        </span>
      )}
    </span>
  )
}
