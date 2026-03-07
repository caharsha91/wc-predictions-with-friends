import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const TARGET_DIRS = [
  path.join(ROOT, 'src', 'ui', 'pages'),
  path.join(ROOT, 'src', 'ui', 'hooks')
]
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])
const DEBUG_LOG_PATTERN = /\bconsole\.(log|debug)\s*\(/

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath)))
      continue
    }
    if (!entry.isFile()) continue
    if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(absolutePath)
  }

  return files
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

async function main() {
  const files = (await Promise.all(TARGET_DIRS.map((dir) => listFiles(dir)))).flat()
  const violations = []

  for (const filePath of files) {
    const source = await fs.readFile(filePath, 'utf8')
    const lines = source.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (!DEBUG_LOG_PATTERN.test(line)) continue
      violations.push(`${relative(filePath)}:${index + 1}: ${line.trim()}`)
    }
  }

  if (violations.length > 0) {
    console.error('Debug log guard failed: remove console.log/debug from src/ui/pages and src/ui/hooks.\n')
    for (const violation of violations) {
      console.error(violation)
    }
    process.exit(1)
    return
  }

  console.log('Debug log guard passed: no console.log/debug found in UI pages/hooks.')
}

await main()
