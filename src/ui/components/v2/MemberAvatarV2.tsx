import { useMemo } from 'react'

import { cn } from '../../lib/utils'
import {
  normalizeFavoriteTeamCode,
  UNKNOWN_FLAG_ASSET_PATH,
  resolveTeamFlagMeta
} from '../../lib/teamFlag'
import FlagBadgeV2 from './FlagBadgeV2'

type MemberAvatarSize = 'sm' | 'md' | 'lg'

type MemberAvatarV2Props = {
  name: string
  favoriteTeamCode?: string | null
  size?: MemberAvatarSize
  className?: string
}

const SIZE_CLASS_BY_VARIANT: Record<MemberAvatarSize, string> = {
  sm: 'h-10 w-[60px]',
  md: 'h-12 w-[72px]',
  lg: 'h-14 w-[84px]'
}

export default function MemberAvatarV2({
  name,
  favoriteTeamCode,
  size = 'md',
  className
}: MemberAvatarV2Props) {
  const canonicalCode = normalizeFavoriteTeamCode(favoriteTeamCode)

  const flagMeta = useMemo(
    () =>
      resolveTeamFlagMeta({
        code: canonicalCode,
        label: canonicalCode ?? 'TBD'
      }),
    [canonicalCode]
  )

  return (
    <span
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden',
        SIZE_CLASS_BY_VARIANT[size],
        className
      )}
    >
      <FlagBadgeV2
        src={flagMeta.assetPath}
        fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
        size="avatar"
        className="h-full w-full rounded-[inherit]"
        imageClassName="h-full w-full object-cover"
      />
    </span>
  )
}
