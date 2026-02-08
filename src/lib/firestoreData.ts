import { doc, getDoc, setDoc } from 'firebase/firestore'

import { firebaseDb, getLeagueId } from './firebase'
import type { GroupPrediction } from '../types/bracket'
import type { MatchWinner } from '../types/matches'
import type { ThemePreference } from '../types/members'
import type { Pick } from '../types/picks'
import type { KnockoutStage } from '../types/scoring'

type BracketGroupDoc = {
  userId: string
  groups: Record<string, GroupPrediction>
  bestThirds?: string[]
  updatedAt: string
}

type BracketKnockoutDoc = {
  userId: string
  knockout?: Partial<Record<KnockoutStage, Record<string, MatchWinner>>>
  updatedAt: string
}

type PicksDoc = {
  userId: string
  picks: Pick[]
  updatedAt: string
}

function getUserDocRef(collectionName: string, userId: string) {
  if (!firebaseDb) return null
  return doc(firebaseDb, 'leagues', getLeagueId(), collectionName, userId)
}

function sanitizePick(pick: Pick, fallbackTimestamp: string): Pick {
  const cleaned: Pick = {
    id: pick.id,
    matchId: pick.matchId,
    userId: pick.userId,
    createdAt: pick.createdAt || fallbackTimestamp,
    updatedAt: pick.updatedAt || fallbackTimestamp
  }
  if (typeof pick.homeScore === 'number') cleaned.homeScore = pick.homeScore
  if (typeof pick.awayScore === 'number') cleaned.awayScore = pick.awayScore
  if (pick.advances === 'HOME' || pick.advances === 'AWAY') cleaned.advances = pick.advances
  if (pick.outcome) cleaned.outcome = pick.outcome
  if (pick.winner) cleaned.winner = pick.winner
  if (pick.decidedBy) cleaned.decidedBy = pick.decidedBy
  return cleaned
}

export async function fetchUserPicksDoc(userId: string): Promise<Pick[] | null> {
  const ref = getUserDocRef('picks', userId)
  if (!ref) return null
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const data = snapshot.data() as PicksDoc
  return Array.isArray(data.picks) ? data.picks : []
}

export async function saveUserPicksDoc(userId: string, picks: Pick[]): Promise<void> {
  const ref = getUserDocRef('picks', userId)
  if (!ref) return
  const now = new Date().toISOString()
  const sanitizedPicks = picks.map((pick) => sanitizePick(pick, now))
  await setDoc(
    ref,
    { userId, picks: sanitizedPicks, updatedAt: now } satisfies PicksDoc,
    { merge: true }
  )
}

export async function fetchUserBracketGroupDoc(
  userId: string
): Promise<{ groups: Record<string, GroupPrediction>; bestThirds?: string[] } | null> {
  return fetchUserGroupStageDoc(userId)
}

export async function fetchUserGroupStageDoc(
  userId: string
): Promise<{ groups: Record<string, GroupPrediction>; bestThirds?: string[] } | null> {
  const ref = getUserDocRef('bracket-group', userId)
  if (!ref) return null
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const data = snapshot.data() as BracketGroupDoc
  return {
    groups: data.groups ?? {},
    bestThirds: data.bestThirds ?? []
  }
}

export async function saveUserBracketGroupDoc(
  userId: string,
  groups: Record<string, GroupPrediction>,
  bestThirds?: string[]
): Promise<void> {
  return saveUserGroupStageDoc(userId, groups, bestThirds)
}

export async function saveUserGroupStageDoc(
  userId: string,
  groups: Record<string, GroupPrediction>,
  bestThirds?: string[]
): Promise<void> {
  const ref = getUserDocRef('bracket-group', userId)
  if (!ref) return
  const now = new Date().toISOString()
  const normalizedBestThirds = bestThirds ?? []
  await setDoc(
    ref,
    { userId, groups, bestThirds: normalizedBestThirds, updatedAt: now } satisfies BracketGroupDoc,
    { merge: true }
  )
}

export async function fetchUserBracketKnockoutDoc(
  userId: string
): Promise<Partial<Record<KnockoutStage, Record<string, MatchWinner>>> | null> {
  const ref = getUserDocRef('bracket-knockout', userId)
  if (!ref) return null
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const data = snapshot.data() as BracketKnockoutDoc
  return data.knockout ?? {}
}

export async function saveUserBracketKnockoutDoc(
  userId: string,
  knockout: Partial<Record<KnockoutStage, Record<string, MatchWinner>>> | undefined
): Promise<void> {
  const ref = getUserDocRef('bracket-knockout', userId)
  if (!ref) return
  const now = new Date().toISOString()
  const normalizedKnockout = knockout ?? {}
  await setDoc(
    ref,
    { userId, knockout: normalizedKnockout, updatedAt: now } satisfies BracketKnockoutDoc,
    { merge: true }
  )
}

export async function saveUserThemePreference(
  email: string | null | undefined,
  theme: ThemePreference
): Promise<void> {
  if (!email) return
  const normalizedEmail = email.toLowerCase()
  if (!firebaseDb) return
  const ref = doc(firebaseDb, 'leagues', getLeagueId(), 'members', normalizedEmail)
  if (!ref) return
  await setDoc(ref, { theme }, { merge: true })
}
