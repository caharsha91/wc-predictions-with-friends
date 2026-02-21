export const GROUP_STAGE_GROUP_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export function stripLegacyGroupStageParams(search: string): string {
  const params = new URLSearchParams(search)
  const hadLegacy =
    params.has('status') ||
    params.has('group') ||
    params.has('focus') ||
    params.has('points')
  if (!hadLegacy) return search
  params.delete('status')
  params.delete('group')
  params.delete('focus')
  params.delete('points')
  const nextQuery = params.toString()
  return nextQuery ? `?${nextQuery}` : ''
}
