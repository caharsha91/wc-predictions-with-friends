export type StageScoring = {
  exactScoreBoth: number
  exactScoreOne: number
  result: number
  knockoutWinner?: number
}

export type ScoringConfig = {
  group: StageScoring
  knockout: Record<KnockoutStage, StageScoring>
}

export type KnockoutStage = 'R32' | 'R16' | 'QF' | 'SF' | 'Third' | 'Final'
