export function isDraw(scoreA: number | undefined, scoreB: number | undefined): boolean {
  return typeof scoreA === 'number' && typeof scoreB === 'number' && scoreA === scoreB
}

export function getWinnerId({
  isKnockout,
  teamAId,
  teamBId,
  scoreA,
  scoreB,
  selectedWinnerId
}: {
  isKnockout: boolean
  teamAId: string
  teamBId: string
  scoreA: number | undefined
  scoreB: number | undefined
  selectedWinnerId?: string
}): string | undefined {
  const hasScores = typeof scoreA === 'number' && typeof scoreB === 'number'
  if (!hasScores) return undefined
  if (scoreA > scoreB) return teamAId
  if (scoreB > scoreA) return teamBId
  if (!isKnockout) return undefined
  if (selectedWinnerId === teamAId || selectedWinnerId === teamBId) return selectedWinnerId
  return undefined
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export function parseInputScore(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return undefined
  return clampScore(parsed)
}
