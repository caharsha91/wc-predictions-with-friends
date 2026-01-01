import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

if (process.env.GITHUB_ACTIONS) {
  console.error('Refusing to run production seeding in GitHub Actions.')
  process.exit(1)
}

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is set. Use scripts/seedEmulators.js instead.')
  process.exit(1)
}

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || undefined
if (!projectId) {
  console.error('Set FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID before seeding production.')
  process.exit(1)
}

const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!credentialsPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON before seeding.')
  process.exit(1)
}

try {
  await fs.access(credentialsPath)
} catch {
  console.error(`Service account JSON not found at ${credentialsPath}.`)
  process.exit(1)
}

const leagueId = process.env.LEAGUE_ID || process.env.VITE_LEAGUE_ID || 'default'

initializeApp({ credential: applicationDefault(), projectId })
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

function cleanFields<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T
}

function parseTimestamp(value: unknown): Timestamp {
  if (!value) return Timestamp.now()
  const date = new Date(value as string)
  if (Number.isNaN(date.getTime())) return Timestamp.now()
  return Timestamp.fromDate(date)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveSeedPath(
  label: string,
  explicitPath: string | undefined,
  preferredPath: string,
  fallbackPath?: string
): Promise<string | null> {
  if (explicitPath) {
    return (await fileExists(explicitPath)) ? explicitPath : null
  }
  if (await fileExists(preferredPath)) return preferredPath
  if (fallbackPath && (await fileExists(fallbackPath))) return fallbackPath
  if (fallbackPath) {
    console.warn(`No ${label} seed file found in ${preferredPath} or ${fallbackPath}.`)
  }
  return null
}

async function loadJson(filePath: string) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function commitBatch(
  items: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>,
  chunkSize = 400
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = db.batch()
    for (const { ref, data } of items.slice(i, i + chunkSize)) {
      batch.set(ref, data, { merge: true })
    }
    await batch.commit()
  }
}

const seedDataDir = process.env.SEED_DATA_DIR || path.join(repoRoot, 'scripts', 'seed-data')
const publicDataDir = path.join(repoRoot, 'public', 'data')

const membersPath = await resolveSeedPath(
  'members',
  process.env.MEMBERS_PATH,
  path.join(seedDataDir, 'members.json'),
  path.join(publicDataDir, 'members.json')
)
if (!membersPath) {
  console.error('Members seed file is required to seed production.')
  process.exit(1)
}

const membersPayload = await loadJson(membersPath)
const membersEntries = Array.isArray(membersPayload.members) ? membersPayload.members : []

const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = []

for (const entry of membersEntries) {
  const email = String(entry.email ?? entry.id ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) continue
  const data = cleanFields({
    email,
    name: entry.name ?? undefined,
    handle: entry.handle ?? undefined,
    isAdmin: entry.isAdmin ?? undefined,
    createdAt: parseTimestamp(entry.createdAt)
  })
  writes.push({
    ref: db.doc(`leagues/${leagueId}/members/${email}`),
    data
  })
}

if (writes.length === 0) {
  console.warn('No members entries found to seed.')
  process.exit(0)
}

await commitBatch(writes)

console.log(`Seeded ${writes.length} members into leagues/${leagueId}.`)
await db.terminate()
