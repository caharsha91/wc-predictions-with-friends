import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const UI_ROOT = join(ROOT, 'src', 'ui')
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const ALLOWED_TOKEN_PATTERNS = [
  /^(?:length:)?var\(--/,
  /^color:var\(--/,
  /^color-mix\(/,
  /^theme\(/
]

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const nextPath = join(dir, entry)
    const stats = statSync(nextPath)
    if (stats.isDirectory()) {
      files.push(...walk(nextPath))
      continue
    }
    if (!SCAN_EXTENSIONS.has(extname(nextPath))) continue
    if (nextPath.endsWith('.test.ts') || nextPath.endsWith('.test.tsx')) continue
    files.push(nextPath)
  }
  return files
}

function isAllowedArbitraryTextToken(value) {
  const normalized = value.trim()
  return ALLOWED_TOKEN_PATTERNS.some((pattern) => pattern.test(normalized))
}

const violations = []
for (const filePath of walk(UI_ROOT)) {
  const source = readFileSync(filePath, 'utf8')
  const lines = source.split('\n')

  lines.forEach((line, index) => {
    const matches = line.matchAll(/text-\[([^\]]+)\]/g)
    for (const match of matches) {
      const tokenValue = match[1]
      if (isAllowedArbitraryTextToken(tokenValue)) continue
      violations.push({
        path: relative(ROOT, filePath).replaceAll('\\', '/'),
        line: index + 1,
        token: tokenValue
      })
    }
  })
}

if (violations.length > 0) {
  console.error('Typography guard failed: found non-token arbitrary text-size/color classes.')
  for (const violation of violations) {
    console.error(`- ${violation.path}:${violation.line} -> text-[${violation.token}]`)
  }
  process.exit(1)
}

console.log('Typography guard passed: arbitrary text classes use theme tokens only.')
