import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = process.cwd()
const SOURCE_ROOT = join(ROOT, 'src')
const ALLOWED_FILES = new Set([
  'src/styles/theme.css',
  'src/styles/themes.css',
  'src/ui/theme/brand.ts'
])
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const COLOR_LITERAL_PATTERN = /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\((?!var\(--)/i

function walk(dir) {
  const entries = readdirSync(dir)
  const files = []
  for (const entry of entries) {
    const nextPath = join(dir, entry)
    const stats = statSync(nextPath)
    if (stats.isDirectory()) {
      files.push(...walk(nextPath))
      continue
    }
    if (!SCAN_EXTENSIONS.has(extname(nextPath))) continue
    files.push(nextPath)
  }
  return files
}

const violations = []
for (const filePath of walk(SOURCE_ROOT)) {
  const repoPath = relative(ROOT, filePath).replaceAll('\\', '/')
  if (ALLOWED_FILES.has(repoPath)) continue
  if (repoPath.endsWith('.test.ts') || repoPath.endsWith('.test.tsx')) continue
  const source = readFileSync(filePath, 'utf8')
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!COLOR_LITERAL_PATTERN.test(line)) {
      continue
    }
    violations.push({
      path: repoPath,
      line: index + 1,
      source: line.trim()
    })
  }
}

if (violations.length > 0) {
  console.error('Token guard failed: ad-hoc color literals found outside theme files.')
  for (const violation of violations) {
    console.error(`- ${violation.path}:${violation.line} -> ${violation.source}`)
  }
  process.exit(1)
}

console.log('Token guard passed: no ad-hoc color literals found.')
