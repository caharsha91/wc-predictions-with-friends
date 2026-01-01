export type ThemeId =
  | 'stadium-night'
  | 'classic'
  | 'sunset'
  | 'ice'
  | 'midnight'
  | 'retro'
  | 'newspaper'
  | 'neon'
  | 'forest'
  | 'royal'

export type ThemeMode = 'light' | 'dark'

export type ThemeSwatch = {
  bg: string
  surface: string
  accent: string
  success: string
  danger: string
}

export type ThemeDefinition = {
  id: ThemeId
  name: string
  description: string
  swatches: Record<ThemeMode, ThemeSwatch>
}

export const DEFAULT_THEME_ID: ThemeId = 'classic'

export const THEMES: ThemeDefinition[] = [
  {
    id: 'stadium-night',
    name: 'Stadium Night',
    description: 'Neon picks hub.',
    swatches: {
      light: {
        bg: '#f7f8fa',
        surface: '#ffffff',
        accent: '#0ea5e9',
        success: '#16a34a',
        danger: '#ef4444'
      },
      dark: {
        bg: '#05070d',
        surface: '#121a26',
        accent: '#3ee6ff',
        success: '#23f7a6',
        danger: '#ff4d5a'
      }
    }
  },
  {
    id: 'classic',
    name: 'Sports broadcast',
    description: 'Crisp on-air clarity.',
    swatches: {
      light: {
        bg: '#f6f8fb',
        surface: '#ffffff',
        accent: '#2563eb',
        success: '#16a34a',
        danger: '#dc2626'
      },
      dark: {
        bg: '#0b1020',
        surface: '#121a2c',
        accent: '#60a5fa',
        success: '#34d399',
        danger: '#f87171'
      }
    }
  },
  {
    id: 'sunset',
    name: 'Golden hour',
    description: 'Warm stadium glow.',
    swatches: {
      light: {
        bg: '#fff4e6',
        surface: '#fffaf2',
        accent: '#f97316',
        success: '#16a34a',
        danger: '#dc2626'
      },
      dark: {
        bg: '#1b0d0a',
        surface: '#2a1410',
        accent: '#fb923c',
        success: '#34d399',
        danger: '#fb7185'
      }
    }
  },
  {
    id: 'ice',
    name: 'Arctic analytics',
    description: 'Icy blues, crisp data.',
    swatches: {
      light: {
        bg: '#f2f7ff',
        surface: '#ffffff',
        accent: '#38bdf8',
        success: '#10b981',
        danger: '#ef4444'
      },
      dark: {
        bg: '#06131f',
        surface: '#0f1d2b',
        accent: '#7dd3fc',
        success: '#34d399',
        danger: '#fb7185'
      }
    }
  },
  {
    id: 'midnight',
    name: 'OLED minimal',
    description: 'Inky blacks, focused accents.',
    swatches: {
      light: {
        bg: '#f4f5f7',
        surface: '#ffffff',
        accent: '#0f766e',
        success: '#16a34a',
        danger: '#dc2626'
      },
      dark: {
        bg: '#000000',
        surface: '#0a0a0a',
        accent: '#10b981',
        success: '#22c55e',
        danger: '#f87171'
      }
    }
  },
  {
    id: 'retro',
    name: '90s scoreboard',
    description: 'Playful neon nostalgia.',
    swatches: {
      light: {
        bg: '#fff4f8',
        surface: '#ffffff',
        accent: '#14b8a6',
        success: '#22c55e',
        danger: '#ef4444'
      },
      dark: {
        bg: '#0f0b12',
        surface: '#18111f',
        accent: '#a3e635',
        success: '#34d399',
        danger: '#fb7185'
      }
    }
  },
  {
    id: 'newspaper',
    name: 'Matchday print',
    description: 'Ink, paper, and grit.',
    swatches: {
      light: {
        bg: '#f8f6f1',
        surface: '#ffffff',
        accent: '#b91c1c',
        success: '#15803d',
        danger: '#b91c1c'
      },
      dark: {
        bg: '#121212',
        surface: '#1c1c1c',
        accent: '#ef4444',
        success: '#22c55e',
        danger: '#f87171'
      }
    }
  },
  {
    id: 'neon',
    name: 'Cyber stadium',
    description: 'Electric beams and glow.',
    swatches: {
      light: {
        bg: '#f2fbff',
        surface: '#ffffff',
        accent: '#d946ef',
        success: '#22c55e',
        danger: '#ef4444'
      },
      dark: {
        bg: '#07040f',
        surface: '#120a1f',
        accent: '#f0abfc',
        success: '#22c55e',
        danger: '#fb7185'
      }
    }
  },
  {
    id: 'forest',
    name: 'Outdoor kit',
    description: 'Fresh greens and earth.',
    swatches: {
      light: {
        bg: '#f4f8f3',
        surface: '#ffffff',
        accent: '#16a34a',
        success: '#15803d',
        danger: '#dc2626'
      },
      dark: {
        bg: '#0b130d',
        surface: '#142017',
        accent: '#4ade80',
        success: '#22c55e',
        danger: '#fb7185'
      }
    }
  },
  {
    id: 'royal',
    name: 'Champions league',
    description: 'Regal blues and gold.',
    swatches: {
      light: {
        bg: '#f5f7ff',
        surface: '#ffffff',
        accent: '#4338ca',
        success: '#16a34a',
        danger: '#dc2626'
      },
      dark: {
        bg: '#0b0d1f',
        surface: '#14162b',
        accent: '#818cf8',
        success: '#34d399',
        danger: '#fb7185'
      }
    }
  }
]

export const THEME_LOOKUP = new Map(THEMES.map((theme) => [theme.id, theme]))

export function getThemeById(themeId: string | null | undefined) {
  if (!themeId) return THEME_LOOKUP.get(DEFAULT_THEME_ID) ?? THEMES[0]
  return THEME_LOOKUP.get(themeId as ThemeId) ?? THEME_LOOKUP.get(DEFAULT_THEME_ID) ?? THEMES[0]
}
