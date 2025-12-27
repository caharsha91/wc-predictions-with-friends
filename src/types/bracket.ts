import type { KnockoutStage } from './scoring'
import type { MatchWinner } from './matches'

export type GroupPrediction = {
  first?: string
  second?: string
}

export type BracketGroupDoc = {
  userId: string
  groups: Record<string, GroupPrediction>
  bestThirds?: string[]
  updatedAt: string
}

export type BracketKnockoutDoc = {
  userId: string
  knockout?: Partial<Record<KnockoutStage, Record<string, MatchWinner>>>
  updatedAt: string
}

export type BracketPrediction = {
  id: string
  userId: string
  groups: Record<string, GroupPrediction>
  bestThirds?: string[]
  knockout?: Partial<Record<KnockoutStage, Record<string, MatchWinner>>>
  createdAt: string
  updatedAt: string
}

export type BracketPredictionsFile = {
  group: BracketGroupDoc[]
  knockout: BracketKnockoutDoc[]
}
