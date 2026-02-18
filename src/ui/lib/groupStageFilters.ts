export const GROUP_STAGE_GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export type GroupStageGroupFilter = 'all' | (typeof GROUP_STAGE_GROUP_CODES)[number]
export type GroupStageFocusFilter = 'all' | '1st' | '2nd'
export type GroupStageStatusFilter = 'all' | 'pending' | 'final' | 'correct' | 'incorrect' | 'locked'
export type GroupStageViewFilter = 'groups' | 'best3' | 'impact'
export type GroupStagePointsFilter = 'on' | 'off'

export type GroupStageQueryState = {
  group: GroupStageGroupFilter
  focus: GroupStageFocusFilter
  status: GroupStageStatusFilter
  view: GroupStageViewFilter
  points: GroupStagePointsFilter
}

export const GROUP_STAGE_QUERY_DEFAULTS: GroupStageQueryState = {
  group: 'all',
  focus: 'all',
  status: 'all',
  view: 'groups',
  points: 'off'
}

const FOCUS_VALUES = new Set<GroupStageFocusFilter>(['all', '1st', '2nd'])
const STATUS_VALUES = new Set<GroupStageStatusFilter>(['all', 'pending', 'final', 'correct', 'incorrect', 'locked'])
const VIEW_VALUES = new Set<GroupStageViewFilter>(['groups', 'best3', 'impact'])
const POINTS_VALUES = new Set<GroupStagePointsFilter>(['on', 'off'])
const GROUP_VALUES = new Set<string>(['all', ...GROUP_STAGE_GROUP_CODES])

function normalizeGroup(value: string | null): GroupStageGroupFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.group
  const normalized = value.trim().toUpperCase()
  if (normalized === 'ALL') return 'all'
  if (GROUP_VALUES.has(normalized)) return normalized as GroupStageGroupFilter
  return GROUP_STAGE_QUERY_DEFAULTS.group
}

function normalizeFocus(value: string | null): GroupStageFocusFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.focus
  const normalized = value.trim().toLowerCase()
  if (FOCUS_VALUES.has(normalized as GroupStageFocusFilter)) return normalized as GroupStageFocusFilter
  return GROUP_STAGE_QUERY_DEFAULTS.focus
}

function normalizeStatus(value: string | null): GroupStageStatusFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.status
  const normalized = value.trim().toLowerCase()
  if (STATUS_VALUES.has(normalized as GroupStageStatusFilter)) return normalized as GroupStageStatusFilter
  return GROUP_STAGE_QUERY_DEFAULTS.status
}

function normalizeView(value: string | null): GroupStageViewFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.view
  const normalized = value.trim().toLowerCase()
  if (VIEW_VALUES.has(normalized as GroupStageViewFilter)) return normalized as GroupStageViewFilter
  return GROUP_STAGE_QUERY_DEFAULTS.view
}

function normalizePoints(value: string | null): GroupStagePointsFilter {
  if (!value) return GROUP_STAGE_QUERY_DEFAULTS.points
  const normalized = value.trim().toLowerCase()
  if (POINTS_VALUES.has(normalized as GroupStagePointsFilter)) return normalized as GroupStagePointsFilter
  return GROUP_STAGE_QUERY_DEFAULTS.points
}

export function readGroupStageQueryState(search: string): GroupStageQueryState {
  const params = new URLSearchParams(search)
  return {
    group: normalizeGroup(params.get('group')),
    focus: normalizeFocus(params.get('focus')),
    status: normalizeStatus(params.get('status')),
    view: normalizeView(params.get('view')),
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
  params.set('group', next.group)
  params.set('focus', next.focus)
  params.set('status', next.status)
  params.set('view', next.view)
  params.set('points', next.points)

  return `?${params.toString()}`
}
