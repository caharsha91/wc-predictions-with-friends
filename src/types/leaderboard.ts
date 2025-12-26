import type { Member } from './members'

export type LeaderboardEntry = {
  member: Member
  totalPoints: number
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  bracketPoints: number
  exactCount: number
  picksCount: number
  earliestSubmission?: string
}

export type LeaderboardFile = {
  lastUpdated: string
  entries: LeaderboardEntry[]
}
