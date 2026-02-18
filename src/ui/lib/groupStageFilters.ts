export const GROUP_STAGE_GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export type GroupStagePointsFilter = 'on' | 'off'

export type GroupStageQueryState = {
  points: GroupStagePointsFilter
}

export const GROUP_STAGE_QUERY_DEFAULTS: GroupStageQueryState = {
  points: 'on'
}

const POINTS_VALUES = new Set<GroupStagePointsFilter>(['on', 'off'])

function normalizePoints(value: string | null): GroupStagePointsFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.points
  const normalized = value.trim().toLowerCase()
  if (POINTS_VALUES.has(normalized as GroupStagePointsFilter)) return normalized as GroupStagePointsFilter
  return GROUP_STAGE_QUERY_DEFAULTS.points
}

export function readGroupStageQueryState(search: string): GroupStageQueryState {
  const params = new URLSearchParams(search)
  return {
    points: normalizePoints(params.get('points'))
  }
}

export function patchGroupStageSearch(search: string, patch: Partial<GroupStageQueryState>): string {
  const current = readGroupStageQueryState(search)
  const next: GroupStageQueryState = {
    ...current,
    ...patch
  }

  const params = new URLSearchParams(search)

  // Strip deprecated params from old shared URLs.
  params.delete('status')
  params.delete('group')
  params.delete('focus')

  // Keep share links clean: only serialize explicit non-default state.
  if (next.points === GROUP_STAGE_QUERY_DEFAULTS.points) {
    params.delete('points')
  } else {
    params.set('points', next.points)
  }

  const nextQuery = params.toString()
  return nextQuery ? `?${nextQuery}` : ''
}

export function stripLegacyGroupStageParams(search: string): string {
  const params = new URLSearchParams(search)
  const hadLegacy = params.has('status') || params.has('group') || params.has('focus')
  const currentPoints = normalizePoints(params.get('points'))
  if (!hadLegacy && currentPoints !== GROUP_STAGE_QUERY_DEFAULTS.points) return search
  params.delete('status')
  params.delete('group')
  params.delete('focus')
  if (currentPoints === GROUP_STAGE_QUERY_DEFAULTS.points) {
    params.delete('points')
  }
  const nextQuery = params.toString()
  return nextQuery ? `?${nextQuery}` : ''
}
