const PLACEHOLDER_CODE_TOKENS = new Set(['', 'TBD', 'TBC', '?'])

export const CANONICAL_TEAM_CODES = [
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

export type CanonicalTeamCode = (typeof CANONICAL_TEAM_CODES)[number]

const TEAM_NAME_BY_CODE = {
  ALG: 'Algeria',
  ARG: 'Argentina',
  AUS: 'Australia',
  AUT: 'Austria',
  BEL: 'Belgium',
  BRA: 'Brazil',
  CAN: 'Canada',
  CIV: "Cote d'Ivoire",
  COL: 'Colombia',
  CPV: 'Cape Verde',
  CRO: 'Croatia',
  CUR: 'Curacao',
  ECU: 'Ecuador',
  EGY: 'Egypt',
  ENG: 'England',
  ESP: 'Spain',
  FRA: 'France',
  GER: 'Germany',
  GHA: 'Ghana',
  HAI: 'Haiti',
  IRN: 'Iran',
  JOR: 'Jordan',
  JPN: 'Japan',
  KOR: 'South Korea',
  KSA: 'Saudi Arabia',
  MAR: 'Morocco',
  MEX: 'Mexico',
  NED: 'Netherlands',
  NOR: 'Norway',
  NZL: 'New Zealand',
  PAN: 'Panama',
  PAR: 'Paraguay',
  POR: 'Portugal',
  QAT: 'Qatar',
  RSA: 'South Africa',
  SCO: 'Scotland',
  SEN: 'Senegal',
  SUI: 'Switzerland',
  TUN: 'Tunisia',
  URU: 'Uruguay',
  USA: 'United States',
  UZB: 'Uzbekistan'
} as const satisfies Record<CanonicalTeamCode, string>

export const UNKNOWN_FLAG_ASSET_PATH = '/flags/unknown.svg'

export const TEAM_FLAG_ASSET_BY_CODE = {
  ALG: '/flags/lib/dz.svg',
  ARG: '/flags/lib/ar.svg',
  AUS: '/flags/lib/au.svg',
  AUT: '/flags/lib/at.svg',
  BEL: '/flags/lib/be.svg',
  BRA: '/flags/lib/br.svg',
  CAN: '/flags/lib/ca.svg',
  CIV: '/flags/lib/ci.svg',
  COL: '/flags/lib/co.svg',
  CPV: '/flags/lib/cv.svg',
  CRO: '/flags/lib/hr.svg',
  CUR: '/flags/lib/cw.svg',
  ECU: '/flags/lib/ec.svg',
  EGY: '/flags/lib/eg.svg',
  ENG: '/flags/lib/gb-eng.svg',
  ESP: '/flags/lib/es.svg',
  FRA: '/flags/lib/fr.svg',
  GER: '/flags/lib/de.svg',
  GHA: '/flags/lib/gh.svg',
  HAI: '/flags/lib/ht.svg',
  IRN: '/flags/lib/ir.svg',
  JOR: '/flags/lib/jo.svg',
  JPN: '/flags/lib/jp.svg',
  KOR: '/flags/lib/kr.svg',
  KSA: '/flags/lib/sa.svg',
  MAR: '/flags/lib/ma.svg',
  MEX: '/flags/lib/mx.svg',
  NED: '/flags/lib/nl.svg',
  NOR: '/flags/lib/no.svg',
  NZL: '/flags/lib/nz.svg',
  PAN: '/flags/lib/pa.svg',
  PAR: '/flags/lib/py.svg',
  POR: '/flags/lib/pt.svg',
  QAT: '/flags/lib/qa.svg',
  RSA: '/flags/lib/za.svg',
  SCO: '/flags/lib/gb-sct.svg',
  SEN: '/flags/lib/sn.svg',
  SUI: '/flags/lib/ch.svg',
  TUN: '/flags/lib/tn.svg',
  URU: '/flags/lib/uy.svg',
  USA: '/flags/lib/us.svg',
  UZB: '/flags/lib/uz.svg'
} as const satisfies Record<CanonicalTeamCode, string>

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

export function isCanonicalTeamCode(value: string | null | undefined): value is CanonicalTeamCode {
  const normalized = normalizeCode(value)
  return Object.prototype.hasOwnProperty.call(TEAM_FLAG_ASSET_BY_CODE, normalized)
}

export function normalizeFavoriteTeamCode(value: string | null | undefined): CanonicalTeamCode | null {
  if (isPlaceholderTeamCodeOrLabel(value)) return null
  const normalized = normalizeCode(value)
  return isCanonicalTeamCode(normalized) ? normalized : null
}

export function buildCanonicalTeamOptions(): Array<{ code: CanonicalTeamCode; name: string }> {
  return CANONICAL_TEAM_CODES.map((code) => ({
    code,
    name: TEAM_NAME_BY_CODE[code]
  }))
}

type ResolveTeamFlagMetaInput = {
  code?: string | null
  name?: string | null
  label?: string | null
}

export type TeamFlagMeta = {
  kind: 'canonical' | 'unknown'
  assetPath: string
  textPrimary: string
  textSecondary: string | null
}

export function resolveTeamFlagMeta({ code, name, label }: ResolveTeamFlagMetaInput): TeamFlagMeta {
  const normalizedCode = normalizeCode(code)
  const normalizedName = normalizeLabel(name)
  const normalizedLabel = normalizeLabel(label)
  const effectiveLabel = normalizedLabel || normalizedCode || normalizedName || 'TBD'

  if (isCanonicalTeamCode(normalizedCode)) {
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
    assetPath: UNKNOWN_FLAG_ASSET_PATH,
    textPrimary: effectiveLabel,
    textSecondary: null
  }
}
