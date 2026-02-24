import { useMemo } from 'react'

import { cn } from '../../lib/utils'
import { PLACEHOLDER_FLAG_ASSET_PATH, resolveTeamFlagMeta } from '../../lib/teamFlag'
import FlagBadgeV2, { type FlagBadgeSize } from './FlagBadgeV2'

type TeamFlagLabelV2Props = {
  code?: string | null
  name?: string | null
  label?: string | null
  showName?: boolean
  truncate?: boolean
  className?: string
  size?: FlagBadgeSize
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
  size = 'md',
  flagClassName,
  primaryClassName,
  secondaryClassName
}: TeamFlagLabelV2Props) {
  const meta = useMemo(() => resolveTeamFlagMeta({ code, name, label }), [code, label, name])

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <FlagBadgeV2 src={meta.assetPath} fallbackSrc={PLACEHOLDER_FLAG_ASSET_PATH} size={size} className={flagClassName} />
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
