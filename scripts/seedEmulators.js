import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const useEmulators = process.env.VITE_USE_FIREBASE_EMULATORS === 'true'
if (!useEmulators) {
  console.error('Set VITE_USE_FIREBASE_EMULATORS=true to seed the local emulator.')
  process.exit(1)
}

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  'demo-wc-predictions'
const leagueId = process.env.LEAGUE_ID || process.env.VITE_LEAGUE_ID || 'default'
const emulatorHost = process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
const firestorePort = process.env.VITE_FIRESTORE_EMULATOR_PORT || '8080'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = `${emulatorHost}:${firestorePort}`
}

initializeApp({ projectId })
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

function cleanFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

function parseTimestamp(value) {
  if (!value) return Timestamp.now()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Timestamp.now()
  return Timestamp.fromDate(date)
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function commitBatch(items, chunkSize = 400) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const batch = db.batch()
    for (const { ref, data } of items.slice(i, i + chunkSize)) {
      batch.set(ref, data, { merge: true })
    }
    await batch.commit()
  }
}

const allowlistPath = path.join(repoRoot, 'public', 'data', 'allowlist.json')
const membersPath = path.join(repoRoot, 'public', 'data', 'members.json')

const allowlistPayload = await loadJson(allowlistPath)
const membersPayload = await loadJson(membersPath)

const allowlistEntries = Array.isArray(allowlistPayload.allowlist)
  ? allowlistPayload.allowlist
  : []
const membersEntries = Array.isArray(membersPayload.members) ? membersPayload.members : []

const writes = []

for (const entry of allowlistEntries) {
  const email = String(entry.email ?? entry.id ?? '').trim().toLowerCase()
  if (!email) continue
  const data = cleanFields({
    email,
    name: entry.name ?? undefined,
    isAdmin: entry.isAdmin ?? undefined,
    createdAt: parseTimestamp(entry.createdAt)
  })
  writes.push({
    ref: db.doc(`leagues/${leagueId}/allowlist/${email}`),
    data
  })
}

for (const entry of membersEntries) {
  const userId = String(entry.id ?? '').trim()
  if (!userId) continue
  const data = cleanFields({
    name: entry.name ?? undefined,
    handle: entry.handle ?? undefined,
    email: entry.email ?? undefined,
    isAdmin: entry.isAdmin ?? undefined
  })
  writes.push({
    ref: db.doc(`leagues/${leagueId}/members/${userId}`),
    data
  })
}

await commitBatch(writes)

console.log(
  `Seeded ${allowlistEntries.length} allowlist entries and ${membersEntries.length} members into leagues/${leagueId}.`
)
await db.terminate()
