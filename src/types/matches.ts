export type MatchStage = 'Group' | 'R32' | 'R16' | 'QF' | 'SF' | 'Third' | 'Final'
export type MatchStatus = 'SCHEDULED' | 'IN_PLAY' | 'FINISHED'
export type MatchWinner = 'HOME' | 'AWAY'
export type MatchDecision = 'REG' | 'ET' | 'PENS'

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
  winner?: MatchWinner
  decidedBy?: MatchDecision
}

export type MatchesFile = {
  lastUpdated: string
  matches: Match[]
}
