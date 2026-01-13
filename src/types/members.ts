import type { ThemeMode } from '../theme/themes'

export type ThemePreference = {
  mode: ThemeMode
  isSystemMode: boolean
}

export type Member = {
  id: string
  name: string
  handle?: string
  email?: string
  isAdmin?: boolean
  isMember?: boolean
  theme?: ThemePreference
}

export type MembersFile = {
  members: Member[]
}
