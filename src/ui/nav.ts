import type { JSX } from 'react'

import {
  AdminIcon,
  BracketIcon,
  CalendarIcon,
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
  { to: '/', label: 'Picks', icon: CalendarIcon, end: true },
  { to: '/results', label: 'Results', icon: ResultsIcon },
  { to: '/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/players', label: 'Players', icon: UsersIcon },
  { to: '/exports', label: 'Exports', icon: AdminIcon }
]

