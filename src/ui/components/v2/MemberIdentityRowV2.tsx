import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import MemberAvatarV2 from './MemberAvatarV2'

type MemberIdentityRowV2Props = {
  name: string
  favoriteTeamCode?: string | null
  subtitle?: ReactNode
  nameBadges?: ReactNode
  badges?: ReactNode
  marker?: ReactNode
  trailing?: ReactNode
  showAvatar?: boolean
  className?: string
  avatarClassName?: string
}

export default function MemberIdentityRowV2({
  name,
  favoriteTeamCode,
  subtitle,
  nameBadges,
  badges,
  marker,
  trailing,
  showAvatar = true,
  className,
  avatarClassName
}: MemberIdentityRowV2Props) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {showAvatar ? <MemberAvatarV2 name={name} favoriteTeamCode={favoriteTeamCode} size="md" className={cn('h-12 w-[72px]', avatarClassName)} /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="v2-member-identity-name min-w-0 flex-1 truncate text-[14px] font-semibold">{name}</div>
          {nameBadges ? <div className="flex shrink-0 items-center gap-1">{nameBadges}</div> : null}
        </div>
        {subtitle ? <div className="v2-member-identity-subline mt-0.5 text-[12px]">{subtitle}</div> : null}
        {badges ? <div className="mt-1 flex flex-wrap items-center gap-1">{badges}</div> : null}
      </div>
      {marker ? <div className="shrink-0">{marker}</div> : null}
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}
