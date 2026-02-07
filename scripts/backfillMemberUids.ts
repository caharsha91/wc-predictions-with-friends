import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore'

const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'firebase-adminsdk.json')

type MemberDoc = {
  email?: string
  name?: string
  isAdmin?: boolean
  id?: string
  uid?: string
  updatedAt?: unknown
}

type PendingWrite = {
  ref: DocumentReference
  data: Record<string, unknown>
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveConfig(): Promise<{
  projectId: string
  credentialsPath: string
  leagueId: string
}> {
  const credentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? DEFAULT_SERVICE_ACCOUNT_PATH
  if (!(await fileExists(credentialsPath))) {
    throw new Error(
      `Service account file not found at ${credentialsPath}. Set GOOGLE_APPLICATION_CREDENTIALS.`
    )
  }

  const credentialsRaw = await fs.readFile(credentialsPath, 'utf8')
  const credentials = JSON.parse(credentialsRaw) as { project_id?: string }
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.VITE_FIREBASE_PROJECT_ID ??
    credentials.project_id
  if (!projectId) {
    throw new Error('Missing project id. Set FIREBASE_PROJECT_ID or VITE_FIREBASE_PROJECT_ID.')
  }

  const leagueId = process.env.LEAGUE_ID ?? process.env.VITE_LEAGUE_ID ?? 'default'
  return { projectId, credentialsPath, leagueId }
}

async function listAuthUsersByEmail(app: App) {
  const auth = getAuth(app)
  const usersByEmail = new Map<string, string>()
  let pageToken: string | undefined

  do {
    const page = await auth.listUsers(1000, pageToken)
    for (const user of page.users) {
      const email = user.email?.trim().toLowerCase()
      const uid = user.uid?.trim()
      if (!email || !uid) continue
      usersByEmail.set(email, uid)
    }
    pageToken = page.pageToken
  } while (pageToken)

  return usersByEmail
}

async function commitBatches(db: ReturnType<typeof getFirestore>, writes: PendingWrite[], chunkSize = 400) {
  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch()
    for (const write of writes.slice(i, i + chunkSize)) {
      batch.set(write.ref, write.data, { merge: true })
    }
    await batch.commit()
  }
}

async function main() {
  const { projectId, credentialsPath, leagueId } = await resolveConfig()
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath
  }

  const appName = 'member-uid-backfill'
  const existing = getApps().find((app) => app.name === appName)
  const app =
    existing ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId
      },
      appName
    )

  const db = getFirestore(app)
  db.settings({ ignoreUndefinedProperties: true })

  const usersByEmail = await listAuthUsersByEmail(app)
  const membersRef = db.collection('leagues').doc(leagueId).collection('members')
  const membersSnap = await membersRef.get()

  let alreadyMapped = 0
  let matched = 0
  let missingAuth = 0
  const writes: PendingWrite[] = []

  for (const docSnap of membersSnap.docs) {
    const data = docSnap.data() as MemberDoc
    const email = (data.email ?? docSnap.id ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue

    const authUid = usersByEmail.get(email)
    if (!authUid) {
      missingAuth += 1
      continue
    }

    if (typeof data.uid === 'string' && data.uid.trim() === authUid) {
      alreadyMapped += 1
      continue
    }

    matched += 1
    writes.push({
      ref: docSnap.ref,
      data: {
        uid: authUid,
        updatedAt: Timestamp.now()
      }
    })
  }

  if (writes.length > 0) {
    await commitBatches(db, writes)
  }

  console.log(`League: ${leagueId}`)
  console.log(`Members scanned: ${membersSnap.size}`)
  console.log(`Auth users indexed by email: ${usersByEmail.size}`)
  console.log(`UID mappings updated: ${writes.length}`)
  console.log(`Already mapped: ${alreadyMapped}`)
  console.log(`No matching auth email: ${missingAuth}`)
  console.log(`Matched emails needing update: ${matched}`)

  await db.terminate()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
