import type { ThemeId, ThemeMode } from '../theme/themes'

export type ThemePreference = {
  id: ThemeId
  mode: ThemeMode
  isSystemMode: boolean
}

export type Member = {
  id: string
  name: string
  handle?: string
  email?: string
  isAdmin?: boolean
  theme?: ThemePreference
}

export type MembersFile = {
  members: Member[]
}
