import { useMemo, useState } from 'react'

import PageHeader from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '../components/ui/Card'
import { useTheme } from '../../theme/ThemeProvider'
import type { ThemeMode, ThemeSwatch } from '../../theme/themes'

const SWATCH_ORDER: Array<{ key: keyof ThemeSwatch; label: string }> = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'accent', label: 'Accent' },
  { key: 'success', label: 'Success' },
  { key: 'danger', label: 'Danger' }
]

export default function ThemeSelectorPage() {
  const { themes, themeId, mode, isSystemMode, setMode, setThemeId, setSystemMode } = useTheme()
  const [notice, setNotice] = useState<string | null>(null)

  const activeTheme = useMemo(() => themes.find((theme) => theme.id === themeId), [themeId, themes])

  const handleApply = (nextThemeId: typeof themeId) => {
    setThemeId(nextThemeId)
    const nextTheme = themes.find((theme) => theme.id === nextThemeId)
    setNotice(nextTheme ? `Applied ${nextTheme.name}.` : 'Theme applied.')
  }

  const swatchMode: ThemeMode = mode

  return (
    <div className="stack">
      <PageHeader
        kicker="Personalize"
        title="Themes"
        subtitle="Pick a look and toggle light or dark."
      />
      <Card className="themeControlsCard">
        <div className="themeControls">
          <div className="themeControlsRow">
            <div className="themeControlsText">
              <div className="sectionTitle">Mode</div>
              <div className="pageSubtitle">Switch between light and dark palettes.</div>
            </div>
            <div className="bracketToggle" role="tablist" aria-label="Color mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'light'}
                className={mode === 'light' ? 'bracketToggleButton active' : 'bracketToggleButton'}
                onClick={() => setMode('light')}
              >
                Light
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'dark'}
                className={mode === 'dark' ? 'bracketToggleButton active' : 'bracketToggleButton'}
                onClick={() => setMode('dark')}
              >
                Dark
              </button>
            </div>
          </div>
          <div className="themeControlsRow">
            <div className="themeControlsText">
              <div className="sectionTitle">System mode</div>
              <div className="pageSubtitle">Follow your device appearance.</div>
            </div>
            <Button
              variant="secondary"
              aria-pressed={isSystemMode}
              onClick={() => setSystemMode(!isSystemMode)}
            >
              {isSystemMode ? 'System On' : 'Use system mode'}
            </Button>
          </div>
        </div>
      </Card>
      {notice ? (
        <div className="themeNotice" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
      <div className="themeGrid">
        {themes.map((theme) => {
          const isActive = theme.id === themeId
          const swatches = theme.swatches[swatchMode]
          return (
            <Card key={theme.id} className="themeCard" data-active={isActive ? 'true' : undefined}>
              <CardHeader
                title={theme.name}
                subtitle={theme.description}
                actions={isActive ? <Badge tone="success">Active</Badge> : null}
              />
              <CardBody>
                <div className="themeSwatches" role="list">
                  {SWATCH_ORDER.map((swatch) => (
                    <span
                      key={swatch.key}
                      className="themeSwatch"
                      style={{ background: swatches[swatch.key] }}
                      role="img"
                      aria-label={swatch.label}
                    />
                  ))}
                </div>
              </CardBody>
              <CardFooter>
                <Button
                  variant={isActive ? 'secondary' : 'primary'}
                  disabled={isActive}
                  onClick={() => handleApply(theme.id)}
                >
                  {isActive ? 'Applied' : 'Apply'}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>
      {activeTheme ? (
        <div className="themeFooterNote">
          Current theme: <span className="themeFooterHighlight">{activeTheme.name}</span>
        </div>
      ) : null}
    </div>
  )
}
