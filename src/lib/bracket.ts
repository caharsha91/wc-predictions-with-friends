import type { BracketPrediction } from '../types/bracket'

const STORAGE_PREFIX = 'wc-bracket'

export function getLocalBracketKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

export function loadLocalBracketPrediction(userId: string): BracketPrediction | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(getLocalBracketKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { prediction?: BracketPrediction }
    return parsed.prediction ?? null
  } catch {
    return null
  }
}

export function saveLocalBracketPrediction(userId: string, prediction: BracketPrediction): void {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ prediction })
  window.localStorage.setItem(getLocalBracketKey(userId), payload)
}

export function mergeBracketPredictions(
  base: BracketPrediction[],
  local: BracketPrediction | null,
  userId: string
): BracketPrediction[] {
  if (!local) return base
  const others = base.filter((prediction) => prediction.userId !== userId)
  return [...others, local]
}
