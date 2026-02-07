import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const THEMES_PATH = join(process.cwd(), 'src/styles/themes.css')
const source = readFileSync(THEMES_PATH, 'utf8')

function getModeBlock(mode) {
  const marker = `:root[data-mode='${mode}']`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`Unable to find mode marker: ${mode}`)

  const openBraceIndex = source.indexOf('{', markerIndex)
  if (openBraceIndex < 0) throw new Error(`Unable to find mode block start: ${mode}`)

  let depth = 0
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index)
      }
    }
  }

  throw new Error(`Unable to find mode block end: ${mode}`)
}

function parseHexVars(block) {
  const vars = {}
  for (const line of block.split('\n')) {
    const match = line.match(/--([a-zA-Z0-9-]+):\s*(#[0-9A-Fa-f]{6})/)
    if (!match) continue
    vars[match[1]] = match[2]
  }
  return vars
}

function hexToRgb(hex) {
  const value = hex.slice(1)
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  ]
}

function toLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(aHex, bHex) {
  const a = toLuminance(hexToRgb(aHex))
  const b = toLuminance(hexToRgb(bHex))
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

const checks = [
  { mode: 'light', bg: 'bg0', fg: 'fg0', min: 4.5, label: 'Light body on base' },
  { mode: 'light', bg: 'bg1', fg: 'fg0', min: 4.5, label: 'Light body on card' },
  { mode: 'light', bg: 'bg2', fg: 'fg0', min: 4.5, label: 'Light body on muted' },
  { mode: 'light', bg: 'bg1', fg: 'fg1', min: 3, label: 'Light large text on card' },
  { mode: 'dark', bg: 'bg0', fg: 'fg0', min: 4.5, label: 'Dark body on base' },
  { mode: 'dark', bg: 'bg1', fg: 'fg0', min: 4.5, label: 'Dark body on card' },
  { mode: 'dark', bg: 'bg2', fg: 'fg0', min: 4.5, label: 'Dark body on muted' },
  { mode: 'dark', bg: 'bg1', fg: 'fg1', min: 3, label: 'Dark large text on card' }
]

const varsByMode = {
  light: parseHexVars(getModeBlock('light')),
  dark: parseHexVars(getModeBlock('dark'))
}

const failures = []
for (const check of checks) {
  const palette = varsByMode[check.mode]
  const bgHex = palette[check.bg]
  const fgHex = palette[check.fg]
  if (!bgHex || !fgHex) {
    failures.push(`${check.label}: missing token(s) ${check.bg}/${check.fg}`)
    continue
  }
  const ratio = contrastRatio(bgHex, fgHex)
  if (ratio < check.min) {
    failures.push(
      `${check.label}: ${ratio.toFixed(2)} < ${check.min} (${check.fg} on ${check.bg})`
    )
  }
}

if (failures.length > 0) {
  console.error('Contrast guard failed.')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Contrast guard passed for key text/surface pairs.')
