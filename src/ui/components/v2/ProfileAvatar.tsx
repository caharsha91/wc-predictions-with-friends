import { UsersIcon } from '../Icons'
import { cn } from '../../lib/utils'

type ProfileAvatarProps = {
  name: string
  photoURL?: string | null
  className?: string
  imageClassName?: string
}

export default function ProfileAvatar({ name, photoURL, className, imageClassName }: ProfileAvatarProps) {
  if (photoURL) {
    return (
      <span className={cn('inline-flex h-9 w-9 shrink-0 rounded-full border border-border/70 bg-bg2', className)}>
        <img
          src={photoURL}
          alt={name}
          className={cn('h-full w-full rounded-full object-cover', imageClassName)}
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'landing-v2-avatar-fallback inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[color:var(--v2-text-strong)]',
        className
      )}
      aria-label={name}
    >
      <UsersIcon className="h-[62%] w-[62%]" />
    </span>
  )
}
