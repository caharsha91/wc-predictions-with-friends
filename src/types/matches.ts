export type MatchStage = 'Group' | 'R16' | 'QF' | 'SF' | 'Final'
export type MatchStatus = 'SCHEDULED' | 'IN_PLAY' | 'FINISHED'

export type Team = {
  code: string
  name: string
}

export type MatchScore = {
  home: number
  away: number
}

export type Match = {
  id: string
  stage: MatchStage
  kickoffUtc: string
  status: MatchStatus
  homeTeam: Team
  awayTeam: Team
  score?: MatchScore
}

export type MatchesFile = {
  lastUpdated: string
  matches: Match[]
}

