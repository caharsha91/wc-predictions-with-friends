export const THEMES = [
  {
    id: 'neo-grid',
    label: 'Neo Pitch Grid',
    kicker: 'Electric lines and OLED glow',
    swatch: '#7cff6b'
  },
  {
    id: 'street-neon',
    label: 'Street Futbol Neon',
    kicker: 'Concrete night with neon pop',
    swatch: '#ff4bd8'
  },
  {
    id: 'broadcast',
    label: 'Matchday Broadcast',
    kicker: 'Studio crisp with ticker energy',
    swatch: '#f25f5c'
  },
  {
    id: 'retro-kits',
    label: 'Retro Kits Remix',
    kicker: 'Halftone color and vintage kits',
    swatch: '#ff9f1c'
  },
  {
    id: 'continental-night',
    label: 'Continental Night',
    kicker: 'Midnight blues and golden crests',
    swatch: '#f6c453'
  },
  {
    id: 'clubhouse',
    label: 'Minimal Clubhouse',
    kicker: 'Warm neutrals and soft textures',
    swatch: '#d4b483'
  },
  {
    id: 'data-dash',
    label: 'Data-Driven Dash',
    kicker: 'Neon analytics and gridlines',
    swatch: '#43f3c3'
  },
  {
    id: 'trophy-room',
    label: 'Trophy Room Luxe',
    kicker: 'Walnut, gold, and spotlights',
    swatch: '#e0b252'
  },
  {
    id: 'festival-flags',
    label: 'Festival of Flags',
    kicker: 'Color ribbons and matchday cheer',
    swatch: '#ff6b6b'
  },
  {
    id: 'coastal-cup',
    label: 'Coastal Cup',
    kicker: 'Sea air with sand-tone calm',
    swatch: '#49c6e5'
  }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

const DEFAULT_THEME: ThemeId = 'neo-grid'

export function getThemeId(): ThemeId {
  return DEFAULT_THEME
}

export function applyTheme(themeId: ThemeId): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = themeId
}

export function setThemeId(themeId: ThemeId): void {
  applyTheme(themeId)
}
