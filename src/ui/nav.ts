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
      { to: '/knockout-bracket', label: 'Knockout Bracket' }
    ]
  },
  { to: '/leaderboard', label: 'League', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  {
    to: '/admin',
    label: 'Admin Console',
    icon: AdminIcon,
    children: [
      { to: '/admin/players', label: 'Players', end: true },
      { to: '/admin/exports', label: 'Exports', end: true },
      { to: '/admin/controls', label: 'Demo Controls', end: true }
    ]
  }
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
      { to: '/demo/knockout-bracket', label: 'Knockout Bracket' }
    ]
  },
  { to: '/demo/leaderboard', label: 'League', icon: TrophyIcon }
]

export const DEMO_ADMIN_NAV: NavItem[] = [
  {
    to: '/demo/admin',
    label: 'Admin Console',
    icon: AdminIcon,
    children: [
      { to: '/demo/admin/players', label: 'Players', end: true },
      { to: '/demo/admin/exports', label: 'Exports', end: true },
      { to: '/demo/admin/controls', label: 'Demo Controls', end: true }
    ]
  }
]
