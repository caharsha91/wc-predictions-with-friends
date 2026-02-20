import type { ThemeMode } from '../theme/themes'

export type ThemePreference = {
  mode: ThemeMode
  isSystemMode: boolean
}

export type Member = {
  // Canonical app identity used across picks, bracket docs, rivals, and leaderboard mapping.
  id: string
  // Alias for auth linkage when reading/writing newer member docs.
  authUid?: string
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
