import type { JSX } from 'react'

import {
  AdminIcon,
  BracketIcon,
  CalendarIcon,
  HomeIcon,
  TrophyIcon,
  UsersIcon
} from './components/Icons'

export type NavItem = {
  to: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  end?: boolean
}

export const MAIN_NAV: NavItem[] = [
  { to: '/play', label: 'Play', icon: HomeIcon, end: true },
  { to: '/play/picks', label: 'Picks', icon: CalendarIcon },
  { to: '/play/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/play/league', label: 'League', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin/players', label: 'Players', icon: UsersIcon },
  { to: '/admin/exports', label: 'Exports', icon: AdminIcon }
]
