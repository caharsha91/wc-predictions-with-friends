import { cn } from '../../lib/utils'
import TeamFlagLabelV2 from './TeamFlagLabelV2'
import type { FlagBadgeSize } from './FlagBadgeV2'

type TeamIdentityInlineV2Props = {
  code?: string | null
  name?: string | null
  label?: string | null
  showName?: boolean
  truncate?: boolean
  size?: FlagBadgeSize
  className?: string
  primaryClassName?: string
  secondaryClassName?: string
}

export default function TeamIdentityInlineV2({
  code,
  name,
  label,
  showName = false,
  truncate = true,
  size = 'md',
  className,
  primaryClassName,
  secondaryClassName
}: TeamIdentityInlineV2Props) {
  return (
    <TeamFlagLabelV2
      code={code}
      name={name}
      label={label}
      showName={showName}
      truncate={truncate}
      size={size}
      className={cn('v2-team-identity-inline', className)}
      primaryClassName={cn('text-current', primaryClassName)}
      secondaryClassName={cn('text-muted-foreground', secondaryClassName)}
    />
  )
}
