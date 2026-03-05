const PLACEHOLDER_CODE_TOKENS = new Set(['', 'TBD', 'TBC', '?'])

function resolvePublicAssetPath(assetPath: string): string {
  const normalizedAssetPath = String(assetPath ?? '').trim()
  if (!normalizedAssetPath) return normalizedAssetPath
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedAssetPath) || normalizedAssetPath.startsWith('data:')) {
    return normalizedAssetPath
  }

  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const strippedAssetPath = normalizedAssetPath.replace(/^\/+/, '')
  return `${normalizedBase}${strippedAssetPath}`
}

export const CANONICAL_TEAM_CODES = [
  'ALB',
  'ALG',
  'ARG',
  'AUS',
  'AUT',
  'BEL',
  'BIH',
  'BOL',
  'BRA',
  'CAN',
  'CIV',
  'COD',
  'COL',
  'CPV',
  'CRO',
  'CUR',
  'CZE',
  'DEN',
  'ECU',
  'EGY',
  'ENG',
  'ESP',
  'FRA',
  'GER',
  'GHA',
  'HAI',
  'IRL',
  'IRN',
  'IRQ',
  'ITA',
  'JAM',
  'JOR',
  'JPN',
  'KOR',
  'KOS',
  'KSA',
  'MAR',
  'MEX',
  'MKD',
  'NCL',
  'NED',
  'NIR',
  'NOR',
  'NZL',
  'PAN',
  'PAR',
  'POL',
  'POR',
  'QAT',
  'ROU',
  'RSA',
  'SCO',
  'SEN',
  'SUI',
  'SUR',
  'SVK',
  'SWE',
  'TUN',
  'TUR',
  'UKR',
  'URU',
  'USA',
  'UZB',
  'WAL'
] as const

export type CanonicalTeamCode = (typeof CANONICAL_TEAM_CODES)[number]

const TEAM_NAME_BY_CODE = {
  ALB: 'Albania',
  ALG: 'Algeria',
  ARG: 'Argentina',
  AUS: 'Australia',
  AUT: 'Austria',
  BEL: 'Belgium',
  BIH: 'Bosnia and Herzegovina',
  BOL: 'Bolivia',
  BRA: 'Brazil',
  CAN: 'Canada',
  CIV: "Cote d'Ivoire",
  COD: 'DR Congo',
  COL: 'Colombia',
  CPV: 'Cape Verde',
  CRO: 'Croatia',
  CUR: 'Curacao',
  CZE: 'Czechia',
  DEN: 'Denmark',
  ECU: 'Ecuador',
  EGY: 'Egypt',
  ENG: 'England',
  ESP: 'Spain',
  FRA: 'France',
  GER: 'Germany',
  GHA: 'Ghana',
  HAI: 'Haiti',
  IRL: 'Republic of Ireland',
  IRN: 'Iran',
  IRQ: 'Iraq',
  ITA: 'Italy',
  JAM: 'Jamaica',
  JOR: 'Jordan',
  JPN: 'Japan',
  KOR: 'South Korea',
  KOS: 'Kosovo',
  KSA: 'Saudi Arabia',
  MAR: 'Morocco',
  MEX: 'Mexico',
  MKD: 'North Macedonia',
  NCL: 'New Caledonia',
  NED: 'Netherlands',
  NIR: 'Northern Ireland',
  NOR: 'Norway',
  NZL: 'New Zealand',
  PAN: 'Panama',
  PAR: 'Paraguay',
  POL: 'Poland',
  POR: 'Portugal',
  QAT: 'Qatar',
  ROU: 'Romania',
  RSA: 'South Africa',
  SCO: 'Scotland',
  SEN: 'Senegal',
  SUI: 'Switzerland',
  SUR: 'Suriname',
  SVK: 'Slovakia',
  SWE: 'Sweden',
  TUN: 'Tunisia',
  TUR: 'Turkey',
  UKR: 'Ukraine',
  URU: 'Uruguay',
  USA: 'United States',
  UZB: 'Uzbekistan',
  WAL: 'Wales'
} as const satisfies Record<CanonicalTeamCode, string>

export const UNKNOWN_FLAG_ASSET_PATH = resolvePublicAssetPath('/flags/unknown.svg')

export const TEAM_FLAG_ASSET_BY_CODE = {
  ALB: '/flags/lib/al.svg',
  ALG: '/flags/lib/dz.svg',
  ARG: '/flags/lib/ar.svg',
  AUS: '/flags/lib/au.svg',
  AUT: '/flags/lib/at.svg',
  BEL: '/flags/lib/be.svg',
  BIH: '/flags/lib/ba.svg',
  BOL: '/flags/lib/bo.svg',
  BRA: '/flags/lib/br.svg',
  CAN: '/flags/lib/ca.svg',
  CIV: '/flags/lib/ci.svg',
  COD: '/flags/lib/cd.svg',
  COL: '/flags/lib/co.svg',
  CPV: '/flags/lib/cv.svg',
  CRO: '/flags/lib/hr.svg',
  CUR: '/flags/lib/cw.svg',
  CZE: '/flags/lib/cz.svg',
  DEN: '/flags/lib/dk.svg',
  ECU: '/flags/lib/ec.svg',
  EGY: '/flags/lib/eg.svg',
  ENG: '/flags/lib/gb-eng.svg',
  ESP: '/flags/lib/es.svg',
  FRA: '/flags/lib/fr.svg',
  GER: '/flags/lib/de.svg',
  GHA: '/flags/lib/gh.svg',
  HAI: '/flags/lib/ht.svg',
  IRL: '/flags/lib/ie.svg',
  IRN: '/flags/lib/ir.svg',
  IRQ: '/flags/lib/iq.svg',
  ITA: '/flags/lib/it.svg',
  JAM: '/flags/lib/jm.svg',
  JOR: '/flags/lib/jo.svg',
  JPN: '/flags/lib/jp.svg',
  KOR: '/flags/lib/kr.svg',
  KOS: '/flags/lib/xk.svg',
  KSA: '/flags/lib/sa.svg',
  MAR: '/flags/lib/ma.svg',
  MEX: '/flags/lib/mx.svg',
  MKD: '/flags/lib/mk.svg',
  NCL: '/flags/lib/nc.svg',
  NED: '/flags/lib/nl.svg',
  NIR: '/flags/lib/gb-nir.svg',
  NOR: '/flags/lib/no.svg',
  NZL: '/flags/lib/nz.svg',
  PAN: '/flags/lib/pa.svg',
  PAR: '/flags/lib/py.svg',
  POL: '/flags/lib/pl.svg',
  POR: '/flags/lib/pt.svg',
  QAT: '/flags/lib/qa.svg',
  ROU: '/flags/lib/ro.svg',
  RSA: '/flags/lib/za.svg',
  SCO: '/flags/lib/gb-sct.svg',
  SEN: '/flags/lib/sn.svg',
  SUI: '/flags/lib/ch.svg',
  SUR: '/flags/lib/sr.svg',
  SVK: '/flags/lib/sk.svg',
  SWE: '/flags/lib/se.svg',
  TUN: '/flags/lib/tn.svg',
  TUR: '/flags/lib/tr.svg',
  UKR: '/flags/lib/ua.svg',
  URU: '/flags/lib/uy.svg',
  USA: '/flags/lib/us.svg',
  UZB: '/flags/lib/uz.svg',
  WAL: '/flags/lib/gb-wls.svg'
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
      assetPath: resolvePublicAssetPath(TEAM_FLAG_ASSET_BY_CODE[normalizedCode]),
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
