import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { combineBracketPredictions } from '../src/lib/bracket'
import { flattenPicksFile } from '../src/lib/picks'
import { buildLeaderboard } from '../src/lib/scoring'
import type { BracketGroupFile, BracketKnockoutFile, BracketPredictionsFile } from '../src/types/bracket'
import type { LeaderboardFile } from '../src/types/leaderboard'
import type { MatchesFile } from '../src/types/matches'
import type { Member, MembersFile } from '../src/types/members'
import type { PicksFile } from '../src/types/picks'
import type { BestThirdQualifiersFile } from '../src/types/qualifiers'
import type { ScoringConfig } from '../src/types/scoring'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')
const DEFAULT_SERVICE_ACCOUNT_PATH = path.join(process.cwd(), 'firebase-adminsdk.json')

function toIsoFromUnknown(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate()
    if (date instanceof Date && Number.isFinite(date.getTime())) {
      return date.toISOString()
    }
  }
  return new Date().toISOString()
}

function parseOptionalScore(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function normalizeFirestorePicks(userId: string, rawPicks: unknown, fallbackTimestamp: string) {
  const parsed: PicksFile['picks'][number]['picks'] = []

  function pushPick(value: unknown, fallbackMatchId?: string) {
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const matchId =
      typeof record.matchId === 'string' && record.matchId.trim()
        ? record.matchId
        : fallbackMatchId && fallbackMatchId.trim()
          ? fallbackMatchId
          : ''
    if (!matchId) return

    const pickUserId =
      typeof record.userId === 'string' && record.userId.trim()
        ? record.userId
        : userId
    const createdAt = toIsoFromUnknown(record.createdAt ?? fallbackTimestamp)
    const updatedAt = toIsoFromUnknown(record.updatedAt ?? fallbackTimestamp)
    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id
        : `pick-${pickUserId}-${matchId}`

    const pick: PicksFile['picks'][number]['picks'][number] = {
      id,
      matchId,
      userId: pickUserId,
      createdAt,
      updatedAt
    }

    const homeScore = parseOptionalScore(record.homeScore)
    const awayScore = parseOptionalScore(record.awayScore)
    if (homeScore !== undefined) pick.homeScore = homeScore
    if (awayScore !== undefined) pick.awayScore = awayScore
    if (record.advances === 'HOME' || record.advances === 'AWAY') pick.advances = record.advances
    if (record.outcome === 'WIN' || record.outcome === 'DRAW' || record.outcome === 'LOSS') {
      pick.outcome = record.outcome
    }
    if (record.winner === 'HOME' || record.winner === 'AWAY') pick.winner = record.winner
    if (record.decidedBy === 'REG' || record.decidedBy === 'ET' || record.decidedBy === 'PENS') {
      pick.decidedBy = record.decidedBy
    }

    parsed.push(pick)
  }

  if (Array.isArray(rawPicks)) {
    for (const item of rawPicks) pushPick(item)
  } else if (rawPicks && typeof rawPicks === 'object') {
    for (const [matchId, value] of Object.entries(rawPicks as Record<string, unknown>)) {
      pushPick(value, matchId)
    }
  }

  const byMatch = new Map<string, PicksFile['picks'][number]['picks'][number]>()
  for (const pick of parsed) {
    const current = byMatch.get(pick.matchId)
    if (!current || new Date(pick.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byMatch.set(pick.matchId, pick)
    }
  }
  return [...byMatch.values()]
}

async function readJson<T>(filename: string): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8')
  return JSON.parse(raw) as T
}

async function readJsonOptional<T>(filename: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(filename)
  } catch {
    return fallback
  }
}

async function writeJson(filename: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`)
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveFirestoreConfig(): Promise<{
  projectId: string
  credentialsPath: string
  leagueId: string
} | null> {
  const candidateCredentialsPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? DEFAULT_SERVICE_ACCOUNT_PATH
  if (!(await fileExists(candidateCredentialsPath))) return null

  const credentialsRaw = await fs.readFile(candidateCredentialsPath, 'utf8')
  const credentials = JSON.parse(credentialsRaw) as { project_id?: string }
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.VITE_FIREBASE_PROJECT_ID ??
    credentials.project_id
  if (!projectId) return null

  const leagueId = process.env.LEAGUE_ID ?? process.env.VITE_LEAGUE_ID ?? 'default'
  return {
    projectId,
    credentialsPath: candidateCredentialsPath,
    leagueId
  }
}

async function loadFirestoreSourceIfAvailable(): Promise<{
  members: Member[]
  picksFile: PicksFile
  bracketFile: BracketPredictionsFile
} | null> {
  const config = await resolveFirestoreConfig()
  if (!config) return null

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = config.credentialsPath
  }

  const { applicationDefault, getApps, initializeApp } = await import('firebase-admin/app')
  const { getFirestore } = await import('firebase-admin/firestore')

  const appName = 'leaderboard-updater'
  const existing = getApps().find((app) => app.name === appName)
  const app =
    existing ??
    initializeApp(
      {
        credential: applicationDefault(),
        projectId: config.projectId
      },
      appName
    )

  const db = getFirestore(app)
  const leagueRef = db.collection('leagues').doc(config.leagueId)
  const [membersSnap, picksSnap, bracketGroupSnap, bracketKnockoutSnap] = await Promise.all([
    leagueRef.collection('members').get(),
    leagueRef.collection('picks').get(),
    leagueRef.collection('bracket-group').get(),
    leagueRef.collection('bracket-knockout').get()
  ])

  const members: Member[] = membersSnap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>
    const email =
      typeof data.email === 'string' && data.email.trim()
        ? data.email.toLowerCase()
        : docSnap.id.toLowerCase()
    const id =
      typeof data.id === 'string' && data.id.trim()
        ? data.id
        : typeof data.uid === 'string' && data.uid.trim()
          ? data.uid
          : email
    return {
      id,
      name:
        typeof data.name === 'string' && data.name.trim()
          ? data.name
          : email || id,
      handle: typeof data.handle === 'string' ? data.handle : undefined,
      email: email || undefined,
      isAdmin: data.isAdmin === true
    }
  })

  const picksFile: PicksFile = {
    picks: picksSnap.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      const updatedAt = toIsoFromUnknown(data.updatedAt)
      const userId =
        typeof data.userId === 'string' && data.userId.trim()
          ? data.userId
          : docSnap.id
      return {
        userId,
        picks: normalizeFirestorePicks(userId, data.picks, updatedAt),
        updatedAt
      }
    })
  }

  const bracketFile: BracketPredictionsFile = {
    group: bracketGroupSnap.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      return {
        userId:
          typeof data.userId === 'string' && data.userId.trim()
            ? data.userId
            : docSnap.id,
        groups:
          data.groups && typeof data.groups === 'object'
            ? (data.groups as Record<string, { first?: string; second?: string }>)
            : {},
        bestThirds: Array.isArray(data.bestThirds) ? (data.bestThirds as string[]) : [],
        updatedAt:
          typeof data.updatedAt === 'string'
            ? data.updatedAt
            : new Date().toISOString()
      }
    }),
    knockout: bracketKnockoutSnap.docs.map((docSnap) => {
      const data = docSnap.data() as Record<string, unknown>
      return {
        userId:
          typeof data.userId === 'string' && data.userId.trim()
            ? data.userId
            : docSnap.id,
        knockout:
          data.knockout && typeof data.knockout === 'object'
            ? (data.knockout as Record<string, Record<string, 'HOME' | 'AWAY'>>)
            : {},
        updatedAt:
          typeof data.updatedAt === 'string'
            ? data.updatedAt
            : new Date().toISOString()
      }
    })
  }

  console.log(
    `Loaded leaderboard sources from Firestore leagues/${config.leagueId} (members=${members.length}, picks=${picksFile.picks.length}).`
  )
  return { members, picksFile, bracketFile }
}

async function main() {
  const matchesFile = await readJson<MatchesFile>('matches.json')
  const firestoreSource = await loadFirestoreSourceIfAvailable()
  const membersFile = await readJsonOptional<MembersFile>('members.json', { members: [] })
  const picksFile = firestoreSource
    ? firestoreSource.picksFile
    : await readJson<PicksFile>('picks.json')
  const scoringFile = await readJson<ScoringConfig>('scoring.json')
  const bracketFile: BracketPredictionsFile = firestoreSource
    ? firestoreSource.bracketFile
    : {
        group: (await readJson<BracketGroupFile>('bracket-group.json')).group ?? [],
        knockout: (await readJson<BracketKnockoutFile>('bracket-knockout.json')).knockout ?? []
      }
  const bestThirdFile = await readJson<BestThirdQualifiersFile>('best-third-qualifiers.json')

  const picks = flattenPicksFile(picksFile)
  const bracketPredictions = combineBracketPredictions(bracketFile)

  const sourceMembers = firestoreSource?.members ?? membersFile.members ?? []
  const membersById = new Map(sourceMembers.map((member) => [member.id, member]))
  const activeUserIds = new Set<string>()
  for (const doc of picksFile.picks ?? []) {
    if (doc.userId) activeUserIds.add(doc.userId)
  }
  for (const doc of bracketFile.group ?? []) {
    if (doc.userId) activeUserIds.add(doc.userId)
  }
  for (const doc of bracketFile.knockout ?? []) {
    if (doc.userId) activeUserIds.add(doc.userId)
  }

  const memberIdsLookLikeEmails =
    sourceMembers.length > 0 &&
    sourceMembers.every((member) => member.id.includes('@'))

  const leaderboardMembers: Member[] = [...sourceMembers]
  const fallbackActiveUsers: Member[] =
    memberIdsLookLikeEmails
      ? []
      : [...activeUserIds]
          .filter((userId) => !membersById.has(userId))
          .sort()
          .map((userId) => ({
            id: userId,
            name: userId
          }))
  leaderboardMembers.push(...fallbackActiveUsers)

  const entries = buildLeaderboard(
    leaderboardMembers,
    matchesFile.matches,
    picks,
    bracketPredictions,
    scoringFile,
    bestThirdFile.qualifiers
  )

  const output: LeaderboardFile = {
    lastUpdated: matchesFile.lastUpdated ?? new Date().toISOString(),
    entries
  }

  await writeJson('leaderboard.json', output)
  console.log(`Updated leaderboard.json (${entries.length} entries).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
