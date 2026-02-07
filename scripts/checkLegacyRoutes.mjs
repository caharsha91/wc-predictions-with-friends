import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const SRC_UI_DIR = path.join(ROOT, 'src', 'ui')
const ALLOWED_FILES = new Set([
  path.join('src', 'ui', 'App.tsx'),
  path.join('src', 'ui', 'App.router.test.tsx')
])

const LEGACY_ROUTE_REGEX = /(["'`])(\/(?:picks(?:\/wizard)?|results|bracket|leaderboard|players|exports))\1/g

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)))
      continue
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(absolutePath)
    }
  }

  return files
}

function relative(filePath) {
  return path.relative(ROOT, filePath)
}

async function main() {
  const files = await listFiles(SRC_UI_DIR)
  const violations = []

  for (const filePath of files) {
    const rel = relative(filePath)
    if (ALLOWED_FILES.has(rel)) continue

    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n')

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      LEGACY_ROUTE_REGEX.lastIndex = 0
      if (!LEGACY_ROUTE_REGEX.test(line)) continue
      violations.push(`${rel}:${index + 1}: ${line.trim()}`)
    }
  }

  if (violations.length > 0) {
    console.error('Legacy route guard failed. Use canonical /play/* or /admin/* routes in UI code.\n')
    for (const violation of violations) {
      console.error(violation)
    }
    process.exitCode = 1
    return
  }

  console.log('Route guard passed: no legacy route literals found outside redirects/tests.')
}

await main()
