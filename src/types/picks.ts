export type PickDecision = 'REG' | 'ET' | 'PENS'
export type PickWinner = 'HOME' | 'AWAY'
export type PickAdvances = 'HOME' | 'AWAY'
export type PickOutcome = 'WIN' | 'DRAW' | 'LOSS'

export type Pick = {
  id: string
  matchId: string
  userId: string
  homeScore?: number
  awayScore?: number
  advances?: PickAdvances
  // Legacy persisted fields kept for backward compatibility adapters.
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
  advances?: PickAdvances
  // Legacy optional fields accepted for migration compatibility.
  outcome?: PickOutcome
  winner?: PickWinner
  decidedBy?: PickDecision
}

export type UserPicksDoc = {
  userId: string
  picks: Pick[]
  updatedAt: string
}

export type PicksFile = {
  picks: UserPicksDoc[]
}
