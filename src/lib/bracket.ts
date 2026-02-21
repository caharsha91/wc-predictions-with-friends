import type {
  BracketGroupDoc,
  BracketKnockoutDoc,
  BracketPrediction,
  BracketPredictionsFile
} from '../types/bracket'
import type { DataMode } from './dataMode'

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
  if (typeof window === 'undefined') return 'pre-group'
  const raw = window.localStorage.getItem(DEMO_SCENARIO_STORAGE_KEY)?.trim() ?? ''
  return DEMO_SCENARIOS.has(raw) ? raw : 'pre-group'
}

function getLegacyDemoBracketKey(userId: string): string {
  return `${STORAGE_PREFIX}:demo:${userId}`
}

function parseBracketPrediction(raw: string | null): BracketPrediction | null {
  if (!raw) return null
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
  if (typeof window === 'undefined') return null
  const scopedKey = getLocalBracketKey(userId, mode)
  const scopedPrediction = parseBracketPrediction(window.localStorage.getItem(scopedKey))
  if (scopedPrediction) return scopedPrediction

  if (mode === 'demo') {
    const legacyKey = getLegacyDemoBracketKey(userId)
    const legacyPrediction = parseBracketPrediction(window.localStorage.getItem(legacyKey))
    if (legacyPrediction) {
      window.localStorage.setItem(scopedKey, JSON.stringify({ prediction: legacyPrediction }))
      window.localStorage.removeItem(legacyKey)
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
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ prediction })
  window.localStorage.setItem(getLocalBracketKey(userId, mode), payload)
  if (mode === 'demo') {
    window.localStorage.removeItem(getLegacyDemoBracketKey(userId))
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
