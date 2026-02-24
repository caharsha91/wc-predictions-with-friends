import { useEffect, useMemo, useState } from 'react'

import { cn } from '../../lib/utils'
import { PLACEHOLDER_FLAG_ASSET_PATH, resolveTeamFlagMeta } from '../../lib/teamFlag'

type TeamFlagLabelV2Props = {
  code?: string | null
  name?: string | null
  label?: string | null
  showName?: boolean
  truncate?: boolean
  className?: string
  flagClassName?: string
  primaryClassName?: string
  secondaryClassName?: string
}

export default function TeamFlagLabelV2({
  code,
  name,
  label,
  showName = false,
  truncate = true,
  className,
  flagClassName,
  primaryClassName,
  secondaryClassName
}: TeamFlagLabelV2Props) {
  const meta = useMemo(() => resolveTeamFlagMeta({ code, name, label }), [code, label, name])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [meta.assetPath])

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex h-4 w-5 shrink-0 overflow-hidden rounded-[4px] border border-border/70 bg-background/70',
          flagClassName
        )}
      >
        <img
          src={failed ? PLACEHOLDER_FLAG_ASSET_PATH : meta.assetPath}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
          decoding="async"
        />
      </span>
      <span className={cn('min-w-0', truncate ? 'truncate' : undefined)}>
        <span className={cn('text-current', truncate ? 'truncate' : undefined, primaryClassName)}>
          {meta.textPrimary}
        </span>
        {showName && meta.textSecondary ? (
          <span
            className={cn(
              'ml-1 text-muted-foreground',
              truncate ? 'truncate' : undefined,
              secondaryClassName
            )}
          >
            {meta.textSecondary}
          </span>
        ) : null}
      </span>
    </span>
  )
}
