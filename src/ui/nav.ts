import type { JSX } from 'react'

import {
  AdminIcon,
  HomeIcon,
  TrophyIcon
} from './components/Icons'

export type NavItem = {
  to: string
  label: string
  icon: (props: { size?: number }) => JSX.Element
  end?: boolean
  children?: Array<{
    to: string
    label: string
    end?: boolean
  }>
}

export const MAIN_NAV: NavItem[] = [
  {
    to: '/',
    label: 'Play Center',
    icon: HomeIcon,
    end: true,
    children: [
      { to: '/group-stage', label: 'Group Stage' },
      { to: '/match-picks', label: 'Match Picks' },
      { to: '/knockout-bracket', label: 'Knockout Bracket' },
      { to: '/leaderboard', label: 'Leaderboard' }
    ]
  },
  { to: '/play/league', label: 'League', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Admin Console', icon: AdminIcon, end: true }
]

export const DEMO_MAIN_NAV: NavItem[] = [
  {
    to: '/demo',
    label: 'Play Center',
    icon: HomeIcon,
    end: true,
    children: [
      { to: '/demo/group-stage', label: 'Group Stage' },
      { to: '/demo/match-picks', label: 'Match Picks' },
      { to: '/demo/knockout-bracket', label: 'Knockout Bracket' },
      { to: '/demo/leaderboard', label: 'Leaderboard' }
    ]
  },
  { to: '/demo/play/league', label: 'League', icon: TrophyIcon }
]

export const DEMO_ADMIN_NAV: NavItem[] = [
  { to: '/demo/admin', label: 'Admin Console', icon: AdminIcon, end: true }
]
