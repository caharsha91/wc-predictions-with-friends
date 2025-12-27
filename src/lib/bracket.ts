import type {
  BracketGroupDoc,
  BracketKnockoutDoc,
  BracketPrediction,
  BracketPredictionsFile
} from '../types/bracket'

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

export function hasBracketData(prediction: BracketPrediction): boolean {
  if (prediction.bestThirds?.some((code) => Boolean(code))) return true
  for (const group of Object.values(prediction.groups ?? {})) {
    if (group?.first || group?.second) return true
  }
  for (const stagePredictions of Object.values(prediction.knockout ?? {})) {
    if (stagePredictions && Object.keys(stagePredictions).length > 0) return true
  }
  return false
}

function buildPredictionFromDocs(
  userId: string,
  groupDoc?: BracketGroupDoc,
  knockoutDoc?: BracketKnockoutDoc
): BracketPrediction {
  const updatedAt = knockoutDoc?.updatedAt ?? groupDoc?.updatedAt ?? new Date().toISOString()
  return {
    id: `bracket-${userId}`,
    userId,
    groups: groupDoc?.groups ?? {},
    bestThirds: groupDoc?.bestThirds ?? [],
    knockout: knockoutDoc?.knockout ?? {},
    createdAt: updatedAt,
    updatedAt
  }
}

export function combineBracketPredictions(
  file: BracketPredictionsFile
): BracketPrediction[] {
  const groupByUser = new Map<string, BracketGroupDoc>()
  const knockoutByUser = new Map<string, BracketKnockoutDoc>()

  for (const doc of file.group ?? []) {
    groupByUser.set(doc.userId, doc)
  }
  for (const doc of file.knockout ?? []) {
    knockoutByUser.set(doc.userId, doc)
  }

  const userIds = new Set<string>([...groupByUser.keys(), ...knockoutByUser.keys()])
  const predictions: BracketPrediction[] = []
  for (const userId of userIds) {
    predictions.push(
      buildPredictionFromDocs(userId, groupByUser.get(userId), knockoutByUser.get(userId))
    )
  }
  return predictions
}
