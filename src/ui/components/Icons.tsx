import type { ReactNode } from 'react'

type IconProps = {
  size?: number
  strokeWidth?: number
  className?: string
}

type IconBaseProps = IconProps & {
  children: ReactNode
  viewBox?: string
}

function IconBase({
  size = 20,
  strokeWidth = 1.8,
  className,
  viewBox = '0 0 24 24',
  children
}: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </IconBase>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </IconBase>
  )
}

export function ResultsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l2.5 2.5L16 9" />
    </IconBase>
  )
}

export function BracketIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 4v16M6 12h6M18 4v16M12 12h6" />
    </IconBase>
  )
}

export function TrophyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4z" />
      <path d="M6 6H4a3 3 0 0 0 3 4" />
      <path d="M18 6h2a3 3 0 0 1-3 4" />
      <path d="M12 12v4" />
      <path d="M8 20h8" />
    </IconBase>
  )
}

export function AdminIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
      <path d="M12 8v7" />
      <path d="M9 12h6" />
    </IconBase>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3" />
      <path d="M4 20c1.5-3 5-5 8-5s6.5 2 8 5" />
    </IconBase>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </IconBase>
  )
}

export function ThemeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3a9 9 0 0 0 0 18h1.2a2.2 2.2 0 0 0 0-4.4H12a4.6 4.6 0 1 1 0-9.2h1.2a2.2 2.2 0 0 0 0-4.4H12z" />
      <circle cx="8.5" cy="10" r="1" />
      <circle cx="15.5" cy="10" r="1" />
      <circle cx="9.5" cy="15" r="1" />
    </IconBase>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 1 1 0 4h-.2a1 1 0 0 0-.9.6z" />
    </IconBase>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12M18 6l-12 12" />
    </IconBase>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </IconBase>
  )
}
