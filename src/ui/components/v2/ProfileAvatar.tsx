import { cn } from '../../lib/utils'

type ProfileAvatarProps = {
  name: string
  photoURL?: string | null
  className?: string
  imageClassName?: string
}

function PersonaGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3" />
      <path d="M6 19c1.4-2.8 3.8-4.2 6-4.2s4.6 1.4 6 4.2" />
    </svg>
  )
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
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-[color:var(--surface-muted)] text-muted-foreground',
        className
      )}
      aria-label={name}
    >
      <PersonaGlyph className="h-[62%] w-[62%]" />
    </span>
  )
}
