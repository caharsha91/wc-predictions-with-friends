const PLACEHOLDER_CODE_TOKENS = new Set(['', 'TBD', 'TBC', '?'])

const CANONICAL_TEAM_CODES = [
  'ALG',
  'ARG',
  'AUS',
  'AUT',
  'BEL',
  'BRA',
  'CAN',
  'CIV',
  'COL',
  'CPV',
  'CRO',
  'CUR',
  'ECU',
  'EGY',
  'ENG',
  'ESP',
  'FRA',
  'GER',
  'GHA',
  'HAI',
  'IRN',
  'JOR',
  'JPN',
  'KOR',
  'KSA',
  'MAR',
  'MEX',
  'NED',
  'NOR',
  'NZL',
  'PAN',
  'PAR',
  'POR',
  'QAT',
  'RSA',
  'SCO',
  'SEN',
  'SUI',
  'TUN',
  'URU',
  'USA',
  'UZB'
] as const

export const PLACEHOLDER_FLAG_ASSET_PATH = '/flags/placeholder.svg'

export const TEAM_FLAG_ASSET_BY_CODE: Record<string, string> = Object.fromEntries(
  CANONICAL_TEAM_CODES.map((code) => [code, `/flags/${code}.svg`])
)

function normalizeCode(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

function normalizeLabel(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

export function isPlaceholderTeamCodeOrLabel(value: string | null | undefined): boolean {
  const normalized = normalizeLabel(value)
  if (!normalized) return true

  const upper = normalized.toUpperCase()
  if (PLACEHOLDER_CODE_TOKENS.has(upper)) return true
  if (/^[A-L][1-4]$/.test(upper)) return true
  if (/^(winner|loser)\s+of\b/i.test(normalized)) return true
  if (/^to be decided$/i.test(normalized)) return true

  return false
}

type ResolveTeamFlagMetaInput = {
  code?: string | null
  name?: string | null
  label?: string | null
}

export type TeamFlagMeta = {
  kind: 'canonical' | 'placeholder' | 'unknown'
  assetPath: string
  textPrimary: string
  textSecondary: string | null
}

export function resolveTeamFlagMeta({ code, name, label }: ResolveTeamFlagMetaInput): TeamFlagMeta {
  const normalizedCode = normalizeCode(code)
  const normalizedName = normalizeLabel(name)
  const normalizedLabel = normalizeLabel(label)
  const effectiveLabel = normalizedLabel || normalizedCode || normalizedName || 'TBD'

  if (
    isPlaceholderTeamCodeOrLabel(effectiveLabel) ||
    isPlaceholderTeamCodeOrLabel(normalizedCode) ||
    isPlaceholderTeamCodeOrLabel(normalizedName)
  ) {
    return {
      kind: 'placeholder',
      assetPath: PLACEHOLDER_FLAG_ASSET_PATH,
      textPrimary: effectiveLabel,
      textSecondary: null
    }
  }

  if (normalizedCode && TEAM_FLAG_ASSET_BY_CODE[normalizedCode]) {
    return {
      kind: 'canonical',
      assetPath: TEAM_FLAG_ASSET_BY_CODE[normalizedCode],
      textPrimary: normalizedCode,
      textSecondary:
        normalizedName && normalizeCode(normalizedName) !== normalizedCode ? normalizedName : null
    }
  }

  return {
    kind: 'unknown',
    assetPath: PLACEHOLDER_FLAG_ASSET_PATH,
    textPrimary: effectiveLabel,
    textSecondary: null
  }
}
