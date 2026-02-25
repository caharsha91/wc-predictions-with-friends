import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'

import { fetchMembers } from '../../lib/data'
import type { DataMode } from '../../lib/dataMode'
import { firebaseAuth, firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import {
  clearDemoLastRoute,
  readDemoFavoriteTeamCode,
  readDemoLastRoute,
  readDemoRivalUserIds,
  writeDemoFavoriteTeamCode,
  writeDemoLastRoute,
  writeDemoRivalUserIds
} from './demoPersistence'
import { normalizeFavoriteTeamCode } from './teamFlag'

export type UserProfile = {
  lastRoute: string | null
  rivalUserIds: string[]
  favoriteTeamCode: string | null
}

export type RivalDirectoryEntry = {
  id: string
  displayName: string
  favoriteTeamCode?: string | null
  email?: string | null
}

type ProfileDoc = {
  lastRoute?: unknown
  rivalUserIds?: unknown
  favoriteTeamCode?: unknown
}

type MemberDoc = ProfileDoc & {
  id?: unknown
  authUid?: unknown
  email?: unknown
  name?: unknown
  handle?: unknown
  favoriteTeamCode?: unknown
}

function normalizeRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeRivalUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const normalized = entry.trim()
    if (!normalized) continue
    unique.add(normalized)
    if (unique.size >= 3) break
  }
  return [...unique]
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed ? trimmed : null
}

function resolveMemberDocId(explicitEmail?: string | null): string | null {
  const fromArg = normalizeEmail(explicitEmail)
  if (fromArg) return fromArg
  return normalizeEmail(firebaseAuth?.currentUser?.email ?? null)
}

export async function readUserProfile(mode: DataMode, memberId: string, email?: string | null): Promise<UserProfile> {
  if (mode === 'demo') {
    return {
      lastRoute: readDemoLastRoute(),
      rivalUserIds: readDemoRivalUserIds(),
      favoriteTeamCode: normalizeFavoriteTeamCode(readDemoFavoriteTeamCode(memberId))
    }
  }

  if (hasFirebase && firebaseDb) {
    const memberDocId = resolveMemberDocId(email)
    if (!memberDocId) return { lastRoute: null, rivalUserIds: [], favoriteTeamCode: null }
    const snapshot = await getDoc(doc(firebaseDb, 'leagues', getLeagueId(), 'members', memberDocId))
    if (snapshot.exists()) {
      const data = snapshot.data() as ProfileDoc
      return {
        lastRoute: normalizeRoute(data.lastRoute),
        rivalUserIds: normalizeRivalUserIds(data.rivalUserIds),
        favoriteTeamCode: normalizeFavoriteTeamCode(
          typeof data.favoriteTeamCode === 'string' || data.favoriteTeamCode == null ? data.favoriteTeamCode : null
        )
      }
    }
    return { lastRoute: null, rivalUserIds: [], favoriteTeamCode: null }
  }

  return { lastRoute: null, rivalUserIds: [], favoriteTeamCode: null }
}

export async function writeUserProfile(
  mode: DataMode,
  memberId: string,
  patch: Partial<UserProfile>,
  email?: string | null
): Promise<void> {
  const normalizedPatch: Partial<UserProfile> = {}
  if ('lastRoute' in patch) normalizedPatch.lastRoute = normalizeRoute(patch.lastRoute ?? null)
  if ('rivalUserIds' in patch) normalizedPatch.rivalUserIds = normalizeRivalUserIds(patch.rivalUserIds ?? [])
  if ('favoriteTeamCode' in patch) normalizedPatch.favoriteTeamCode = normalizeFavoriteTeamCode(patch.favoriteTeamCode ?? null)

  if (mode === 'demo') {
    if ('lastRoute' in normalizedPatch) {
      if (normalizedPatch.lastRoute) writeDemoLastRoute(normalizedPatch.lastRoute)
      else clearDemoLastRoute()
    }
    if ('rivalUserIds' in normalizedPatch) {
      writeDemoRivalUserIds(normalizedPatch.rivalUserIds ?? [])
    }
    if ('favoriteTeamCode' in normalizedPatch) {
      writeDemoFavoriteTeamCode(memberId, normalizedPatch.favoriteTeamCode ?? null)
    }
    return
  }

  if (hasFirebase && firebaseDb) {
    const memberDocId = resolveMemberDocId(email)
    if (!memberDocId) {
      throw new Error('Unable to resolve member profile path: missing signed-in email.')
    }
    const currentAuthUser = firebaseAuth?.currentUser ?? null
    const payload: Record<string, unknown> = {
      updatedAt: new Date().toISOString()
    }
    payload.email = memberDocId
    if (currentAuthUser?.displayName) payload.displayName = currentAuthUser.displayName
    if (currentAuthUser?.uid) payload.authUid = currentAuthUser.uid
    if ('lastRoute' in normalizedPatch) payload.lastRoute = normalizedPatch.lastRoute ?? null
    if ('rivalUserIds' in normalizedPatch) payload.rivalUserIds = normalizedPatch.rivalUserIds ?? []
    if ('favoriteTeamCode' in normalizedPatch) payload.favoriteTeamCode = normalizedPatch.favoriteTeamCode ?? null
    await setDoc(doc(firebaseDb, 'leagues', getLeagueId(), 'members', memberDocId), payload, { merge: true })
    return
  }
}

export async function fetchRivalDirectory(
  mode: DataMode,
  currentMemberId: string,
  currentEmail?: string | null
): Promise<RivalDirectoryEntry[]> {
  if (mode === 'demo') {
    const members = await fetchMembers({ mode: 'demo' })
    return members.members
      .filter((member) => member.id !== currentMemberId)
      .map((member) => ({
        id: member.id,
        displayName: member.name,
        favoriteTeamCode: normalizeFavoriteTeamCode(member.favoriteTeamCode)
      }))
  }

  if (hasFirebase && firebaseDb) {
    void currentEmail
    const snapshot = await getDocs(collection(firebaseDb, 'leagues', getLeagueId(), 'members'))
    const entries: RivalDirectoryEntry[] = []
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as MemberDoc
      const entryEmail = normalizeEmail(data.email ?? docSnap.id)
      const entryId = typeof data.id === 'string' ? data.id.trim() : ''
      if (entryId && entryId === currentMemberId) continue
      if (!entryId) continue
      const displayName =
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.handle === 'string' && data.handle.trim()) ||
        entryId ||
        entryEmail ||
        docSnap.id

      entries.push({
        id: entryId,
        displayName,
        favoriteTeamCode: normalizeFavoriteTeamCode(
          typeof data.favoriteTeamCode === 'string' || data.favoriteTeamCode == null ? data.favoriteTeamCode : null
        ),
        email: entryEmail
      })
    }
    return entries
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }

  const members = await fetchMembers({ mode: 'default' })
  return members.members
    .filter((member) => member.id !== currentMemberId)
    .map((member) => ({
      id: member.id,
      displayName: member.name,
      favoriteTeamCode: normalizeFavoriteTeamCode(member.favoriteTeamCode)
    }))
}
