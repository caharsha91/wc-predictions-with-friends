type PriorityRankedRow<Row> = {
  row: Row
  points: number
  bucket: number
  nameKey: string
  identityKey: string
  identityKeys: string[]
  originalIndex: number
}

export type TieRankedRow<Row> = {
  row: Row
  rank: number
}

export function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizeIdentityList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values) {
    const normalized = normalizeIdentity(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

function resolvePriorityBucket(identityKeys: Set<string>, viewerKey: string, rivalKeys: string[]): number {
  if (viewerKey && identityKeys.has(viewerKey)) return 0
  for (let index = 0; index < rivalKeys.length; index += 1) {
    if (identityKeys.has(rivalKeys[index])) return index + 1
  }
  return rivalKeys.length + 1
}

export function rankRowsWithTiePriority<Row>({
  rows,
  getPoints,
  getIdentityKeys,
  getName,
  viewerIdentity,
  rivalIdentities = []
}: {
  rows: Row[]
  getPoints: (row: Row) => number
  getIdentityKeys: (row: Row) => Array<string | null | undefined>
  getName?: (row: Row) => string | null | undefined
  viewerIdentity?: string | null
  rivalIdentities?: Array<string | null | undefined>
}): {
  sortedRows: Row[]
  rankedRows: TieRankedRow<Row>[]
  rankByIdentity: Map<string, number>
} {
  const viewerKey = normalizeIdentity(viewerIdentity)
  const rivalKeys = normalizeIdentityList(rivalIdentities).filter((key) => key !== viewerKey).slice(0, 3)

  const decorated: PriorityRankedRow<Row>[] = rows.map((row, index) => {
    const identityKeys = normalizeIdentityList(getIdentityKeys(row))
    const identitySet = new Set(identityKeys)
    const rawPoints = getPoints(row)
    const points = Number.isFinite(rawPoints) ? rawPoints : 0
    return {
      row,
      points,
      bucket: resolvePriorityBucket(identitySet, viewerKey, rivalKeys),
      nameKey: normalizeIdentity(getName?.(row)),
      identityKey: identityKeys[0] ?? '',
      identityKeys,
      originalIndex: index
    }
  })

  decorated.sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points
    if (left.bucket !== right.bucket) return left.bucket - right.bucket
    if (left.nameKey !== right.nameKey) return left.nameKey.localeCompare(right.nameKey)
    if (left.identityKey !== right.identityKey) return left.identityKey.localeCompare(right.identityKey)
    return left.originalIndex - right.originalIndex
  })

  const rankedRows: TieRankedRow<Row>[] = []
  const rankByIdentity = new Map<string, number>()
  let previousPoints: number | null = null
  let currentRank = 0

  for (let index = 0; index < decorated.length; index += 1) {
    const row = decorated[index]
    if (previousPoints === null || row.points !== previousPoints) {
      currentRank = index + 1
      previousPoints = row.points
    }
    rankedRows.push({ row: row.row, rank: currentRank })
    for (const key of row.identityKeys) {
      if (!rankByIdentity.has(key)) rankByIdentity.set(key, currentRank)
    }
  }

  return {
    sortedRows: rankedRows.map((entry) => entry.row),
    rankedRows,
    rankByIdentity
  }
}
