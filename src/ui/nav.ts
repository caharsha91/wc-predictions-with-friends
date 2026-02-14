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
}

export const MAIN_NAV: NavItem[] = [
  { to: '/play', label: 'Play', icon: HomeIcon, end: true },
  { to: '/play/league', label: 'League', icon: TrophyIcon }
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Admin Console', icon: AdminIcon, end: true }
]

export const DEMO_MAIN_NAV: NavItem[] = [
  { to: '/demo/play', label: 'Play', icon: HomeIcon, end: true },
  { to: '/demo/play/league', label: 'League', icon: TrophyIcon }
]

export const DEMO_ADMIN_NAV: NavItem[] = [
  { to: '/demo/admin', label: 'Admin Console', icon: AdminIcon, end: true }
]
