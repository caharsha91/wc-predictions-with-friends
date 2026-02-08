import type { JSX } from 'react'

import {
  AdminIcon,
  BracketIcon,
  CalendarIcon,
  HomeIcon,
  ResultsIcon,
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
  { to: '/play/group-stage', label: 'Group Stage', icon: ResultsIcon },
  { to: '/play/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/play/league', label: 'League', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin/players', label: 'Players', icon: UsersIcon },
  { to: '/admin/exports', label: 'Exports', icon: AdminIcon }
]

export const DEMO_MAIN_NAV: NavItem[] = [
  { to: '/demo/play', label: 'Play', icon: HomeIcon, end: true },
  { to: '/demo/play/picks', label: 'Picks', icon: CalendarIcon },
  { to: '/demo/play/group-stage', label: 'Group Stage', icon: ResultsIcon },
  { to: '/demo/play/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/demo/play/league', label: 'League', icon: TrophyIcon }
]

export const DEMO_ADMIN_NAV: NavItem[] = [
  { to: '/demo/admin/controls', label: 'Controls', icon: AdminIcon },
  { to: '/demo/admin/players', label: 'Players', icon: UsersIcon },
  { to: '/demo/admin/exports', label: 'Exports', icon: AdminIcon }
]
