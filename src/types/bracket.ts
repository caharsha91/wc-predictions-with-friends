import type { KnockoutStage } from './scoring'
import type { MatchWinner } from './matches'

export type GroupPrediction = {
  first?: string
  second?: string
}

export type BracketPrediction = {
  id: string
  userId: string
  groups: Record<string, GroupPrediction>
  knockout?: Partial<Record<KnockoutStage, Record<string, MatchWinner>>>
  createdAt: string
  updatedAt: string
}

export type BracketPredictionsFile = {
  predictions: BracketPrediction[]
}
