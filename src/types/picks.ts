export type PickDecision = 'REG' | 'ET' | 'PENS'
export type PickWinner = 'HOME' | 'AWAY'
export type PickOutcome = 'WIN' | 'DRAW' | 'LOSS'

export type Pick = {
  id: string
  matchId: string
  userId: string
  homeScore?: number
  awayScore?: number
  outcome?: PickOutcome
  winner?: PickWinner
  decidedBy?: PickDecision
  createdAt: string
  updatedAt: string
}

export type PickInput = {
  matchId: string
  userId: string
  homeScore?: number
  awayScore?: number
  outcome?: PickOutcome
  winner?: PickWinner
  decidedBy?: PickDecision
}

export type PicksFile = {
  picks: Pick[]
}
