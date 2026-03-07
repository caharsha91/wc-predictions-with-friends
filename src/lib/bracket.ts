import type {
  BracketGroupDoc,
  BracketKnockoutDoc,
  BracketPrediction,
  BracketPredictionsFile
} from '../types/bracket'
import type { DataMode } from './dataMode'
import { getParsedStorage, getStoredString, removeStoredKey, setSerializedStorage } from './storage'

const STORAGE_PREFIX = 'wc-bracket'
const DEMO_SCENARIO_STORAGE_KEY = 'wc-demo-scenario'
const DEMO_SCENARIOS = new Set([
  'pre-group',
  'mid-group',
  'end-group-draw-confirmed',
  'mid-knockout',
  'world-cup-final-pending'
])

function readDemoScenarioId(): string {
  const raw = getStoredString(DEMO_SCENARIO_STORAGE_KEY)?.trim() ?? ''
  return DEMO_SCENARIOS.has(raw) ? raw : 'pre-group'
}

function getLegacyDemoBracketKey(userId: string): string {
  return `${STORAGE_PREFIX}:demo:${userId}`
}

function parseBracketPrediction(raw: string): BracketPrediction | null {
  try {
    const parsed = JSON.parse(raw) as { prediction?: BracketPrediction }
    return parsed.prediction ?? null
  } catch {
    return null
  }
}

export function getLocalBracketKey(userId: string, mode: DataMode = 'default'): string {
  if (mode === 'demo') {
    return `${STORAGE_PREFIX}:${mode}:${readDemoScenarioId()}:${userId}`
  }
  return `${STORAGE_PREFIX}:${mode}:${userId}`
}

export function loadLocalBracketPrediction(
  userId: string,
  mode: DataMode = 'default'
): BracketPrediction | null {
  const scopedKey = getLocalBracketKey(userId, mode)
  const scopedPrediction = getParsedStorage(scopedKey, parseBracketPrediction)
  if (scopedPrediction) return scopedPrediction

  if (mode === 'demo') {
    const legacyKey = getLegacyDemoBracketKey(userId)
    const legacyPrediction = getParsedStorage(legacyKey, parseBracketPrediction)
    if (legacyPrediction) {
      setSerializedStorage(scopedKey, { prediction: legacyPrediction })
      removeStoredKey(legacyKey)
      return legacyPrediction
    }
  }

  return null
}

export function saveLocalBracketPrediction(
  userId: string,
  prediction: BracketPrediction,
  mode: DataMode = 'default'
): void {
  setSerializedStorage(getLocalBracketKey(userId, mode), { prediction })
  if (mode === 'demo') {
    removeStoredKey(getLegacyDemoBracketKey(userId))
  }
}

export function hasBracketData(prediction: BracketPrediction): boolean {
  if (prediction.bestThirds?.some((code) => Boolean(code))) return true
  for (const group of Object.values(prediction.groups ?? {})) {
    if (Array.isArray(group?.ranking) && group.ranking.some((code) => Boolean(code))) return true
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
