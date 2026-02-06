export const BRAND_HEX = {
  primary: '#2563EB',
  secondary: '#7C3AED',
  accent: '#A3E635',
  danger: '#EF4444'
} as const

export const BRAND_RGB = {
  primary: '37, 99, 235',
  secondary: '124, 58, 237',
  accent: '163, 230, 53',
  danger: '239, 68, 68'
} as const

export const BRAND_GRADIENTS = {
  shell: `linear-gradient(112deg, ${BRAND_HEX.primary}, ${BRAND_HEX.secondary})`,
  sidebar: `linear-gradient(180deg, ${BRAND_HEX.primary}, ${BRAND_HEX.secondary})`,
  hero: `linear-gradient(110deg, ${BRAND_HEX.primary}, ${BRAND_HEX.secondary})`
} as const

export const BRAND_USAGE_RULES = {
  gradientSurfaces: ['sidebar', 'topbar', 'hero'] as const,
  accentUse: 'small-highlights-only',
  primaryCta: BRAND_HEX.primary,
  secondaryHighlight: BRAND_HEX.secondary
} as const
