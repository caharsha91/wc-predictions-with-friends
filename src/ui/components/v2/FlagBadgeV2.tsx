import { useEffect, useMemo, useState } from 'react'

import { cn } from '../../lib/utils'

export type FlagBadgeSize = 'xs' | 'sm' | 'md' | 'avatar'

type FlagBadgeV2Props = {
  src: string
  fallbackSrc: string
  size?: FlagBadgeSize
  className?: string
  imageClassName?: string
}

const SIZE_CLASS_BY_VARIANT: Record<FlagBadgeSize, string> = {
  xs: 'h-7 w-11',
  sm: 'h-9 w-14',
  md: 'h-10 w-16',
  avatar: 'h-12 w-[72px]'
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
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
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
        <span aria-hidden="true" className="v2-type-chip font-semibold text-muted-foreground">
          ?
        </span>
      )}
    </span>
  )
}
