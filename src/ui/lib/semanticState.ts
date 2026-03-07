export type SemanticState =
  | 'default'
  | 'selection'
  | 'you'
  | 'rival'
  | 'warning'
  | 'conflict'
  | 'success'
  | 'locked'
  | 'published'
  | 'disabled'

export type SemanticStateFlags = {
  disabled?: boolean
  conflict?: boolean
  warning?: boolean
  locked?: boolean
  published?: boolean
  selected?: boolean
  you?: boolean
  rival?: boolean
  success?: boolean
}

export function resolveSemanticState({
  disabled,
  conflict,
  warning,
  locked,
  published,
  selected,
  you,
  rival,
  success
}: SemanticStateFlags): SemanticState {
  if (disabled) return 'disabled'
  if (conflict) return 'conflict'
  if (warning) return 'warning'
  if (locked) return 'locked'
  if (published) return 'published'
  if (selected) return 'selection'
  if (you) return 'you'
  if (rival) return 'rival'
  if (success) return 'success'
  return 'default'
}

export function semanticSurfaceClass(state: SemanticState | null | undefined): string | undefined {
  if (!state || state === 'default') return undefined
  return `v2-semantic-surface v2-semantic-${state}`
}

export function semanticChipClass(state: SemanticState | null | undefined): string | undefined {
  if (!state || state === 'default') return undefined
  return `v2-semantic-chip v2-semantic-${state}`
}

export function semanticTextClass(state: SemanticState | null | undefined): string | undefined {
  if (!state || state === 'default') return undefined
  return `v2-semantic-text-${state}`
}
