import { useCallback, useEffect, useMemo, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import { doc, getDoc } from 'firebase/firestore'

import { loadLocalBracketPrediction, saveLocalBracketPrediction } from '../../lib/bracket'
import { fetchBracketPredictions } from '../../lib/data'
import { fetchUserGroupStageDoc, saveUserGroupStageDoc } from '../../lib/firestoreData'
import { firebaseAuth, firebaseDb, getLeagueId, hasFirebase } from '../../lib/firebase'
import {
  applyGroupRanking,
  hasAnyGroupRankingSelection,
  normalizeGroupRanking
} from '../../lib/groupRanking'
import { getGroupOutcomesLockTime } from '../../lib/matches'
import type { GroupPrediction } from '../../types/bracket'
import type { Match } from '../../types/matches'
import { useAuthState } from './useAuthState'
import { refreshCurrentUser, useCurrentUser } from './useCurrentUser'
import { useDemoScenarioState } from './useDemoScenarioState'
import { useRouteDataMode } from './useRouteDataMode'
import { useViewerId } from './useViewerId'

const DEFAULT_BEST_THIRD_SLOTS = 8

type GroupStageLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

type GroupStageData = {
  groups: Record<string, GroupPrediction>
  bestThirds: string[]
  updatedAt: string
}

type GroupStageSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'locked'

type GroupStageSaveResult =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'error' }

type GroupRankingSaveResult =
  | { ok: true; changed: boolean; bestThirds: string[] }
  | { ok: false; reason: 'locked' | 'error' }

function buildGroupIds(matches: Match[]): string[] {
  const ids = new Set<string>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    ids.add(match.group)
  }
  return [...ids].sort()
}

function buildGroupTeamCodesByGroup(matches: Match[]): Record<string, string[]> {
  const groups = new Map<string, Set<string>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const group = groups.get(match.group) ?? new Set<string>()
    group.add(match.homeTeam.code)
    group.add(match.awayTeam.code)
    groups.set(match.group, group)
  }

  const next: Record<string, string[]> = {}
  for (const [groupId, codes] of groups.entries()) {
    next[groupId] = [...codes].sort((a, b) => a.localeCompare(b))
  }
  return next
}

function createEmptyData(groupIds: string[]): GroupStageData {
  const groups: Record<string, GroupPrediction> = {}
  for (const id of groupIds) {
    groups[id] = {}
  }
  return {
    groups,
    bestThirds: [],
    updatedAt: new Date().toISOString()
  }
}

function normalizeGroups(
  groups: Record<string, GroupPrediction>,
  groupIds: string[],
  groupTeamCodesByGroup: Record<string, string[]>
): Record<string, GroupPrediction> {
  const next: Record<string, GroupPrediction> = {}
  for (const groupId of groupIds) {
    const current = groups[groupId] ?? {}
    const teamCodes = groupTeamCodesByGroup[groupId] ?? []
    if (teamCodes.length === 0) {
      next[groupId] = { ...current }
      continue
    }
    const normalizedRanking = normalizeGroupRanking(current.ranking, teamCodes)
    const normalizedGroup = applyGroupRanking(current, normalizedRanking, teamCodes)
    next[groupId] = normalizedGroup
  }
  return next
}

function normalizeBestThirds(bestThirds: string[] | undefined, slotCount: number): string[] {
  const next = Array.isArray(bestThirds) ? [...bestThirds] : []
  while (next.length < slotCount) next.push('')
  return next.slice(0, slotCount)
}

function hasAnyGroupSelection(
  groups: Record<string, GroupPrediction>,
  bestThirds: string[],
  groupTeamCodesByGroup: Record<string, string[]>
): boolean {
  for (const [groupId, group] of Object.entries(groups)) {
    const teamCodes = groupTeamCodesByGroup[groupId] ?? []
    if (teamCodes.length === 0) {
      if (group?.first || group?.second) return true
      if (Array.isArray(group?.ranking) && group.ranking.length > 0) return true
      continue
    }
    if (hasAnyGroupRankingSelection(group, teamCodes)) return true
  }
  return bestThirds.some((team) => Boolean(team))
}

function saveLocalGroupStage(userId: string, data: GroupStageData, mode: 'default' | 'demo') {
  const existing = loadLocalBracketPrediction(userId, mode)
  const updatedAt = data.updatedAt || new Date().toISOString()
  saveLocalBracketPrediction(userId, {
    id: existing?.id ?? `bracket-${userId}`,
    userId,
    groups: data.groups,
    bestThirds: data.bestThirds,
    knockout: existing?.knockout ?? {},
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt
  }, mode)
}

export function useGroupStageData(matches: Match[]) {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const mode = useRouteDataMode()
  const isDemoMode = mode === 'demo'
  const demoScenario = useDemoScenarioState()
  const userId = useViewerId()
  const groupIds = useMemo(() => buildGroupIds(matches), [matches])
  const groupTeamCodesByGroup = useMemo(() => buildGroupTeamCodesByGroup(matches), [matches])
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])

  const [loadState, setLoadState] = useState<GroupStageLoadState>({ status: 'loading' })
  const [saveStatus, setSaveStatus] = useState<GroupStageSaveStatus>('idle')
  const [data, setData] = useState<GroupStageData>(() => createEmptyData(groupIds))
  const [forcedLocked, setForcedLocked] = useState(false)

  const firestoreEnabled =
    !isDemoMode &&
    hasFirebase &&
    authState.status === 'ready' &&
    !!authState.user &&
    currentUser?.isMember === true
  const isLiveMode = !isDemoMode && hasFirebase
  const isTimeLocked = groupLockTime ? Date.now() >= groupLockTime.getTime() : false
  const isLocked = forcedLocked || isTimeLocked

  async function resolveCanonicalUserId(fallbackUserId: string): Promise<string> {
    if (!isLiveMode || !firebaseDb) return fallbackUserId
    const email = firebaseAuth?.currentUser?.email?.toLowerCase() ?? null
    if (!email) return fallbackUserId
    try {
      const snapshot = await getDoc(doc(firebaseDb, 'leagues', getLeagueId(), 'members', email))
      if (!snapshot.exists()) return fallbackUserId
      const data = snapshot.data() as { id?: unknown }
      const canonicalId = typeof data.id === 'string' ? data.id.trim() : ''
      return canonicalId || fallbackUserId
    } catch {
      return fallbackUserId
    }
  }

  useEffect(() => {
    let canceled = false

    async function load() {
      if (groupIds.length === 0) {
        setForcedLocked(false)
        setData(createEmptyData([]))
        setLoadState({ status: 'ready' })
        return
      }
      if (hasFirebase && authState.status === 'loading') return

      setLoadState({ status: 'loading' })
      setSaveStatus('idle')
      setForcedLocked(false)
      const slotCount = DEFAULT_BEST_THIRD_SLOTS
      const empty = createEmptyData(groupIds)
      setData({
        ...empty,
        bestThirds: normalizeBestThirds(empty.bestThirds, slotCount)
      })

      try {
        let next: GroupStageData | null = null

        if (firestoreEnabled) {
          const canonicalUserId = await resolveCanonicalUserId(userId)
          const remote = await fetchUserGroupStageDoc(canonicalUserId)
          if (remote) {
            next = {
              groups: normalizeGroups(remote.groups ?? {}, groupIds, groupTeamCodesByGroup),
              bestThirds: normalizeBestThirds(remote.bestThirds ?? [], slotCount),
              updatedAt: new Date().toISOString()
            }
          } else {
            next = {
              groups: normalizeGroups({}, groupIds, groupTeamCodesByGroup),
              bestThirds: normalizeBestThirds([], slotCount),
              updatedAt: new Date().toISOString()
            }
          }
        } else if (!isLiveMode) {
          const local = loadLocalBracketPrediction(userId, mode)
          if (local && hasAnyGroupSelection(local.groups ?? {}, local.bestThirds ?? [], groupTeamCodesByGroup)) {
            next = {
              groups: normalizeGroups(local.groups ?? {}, groupIds, groupTeamCodesByGroup),
              bestThirds: normalizeBestThirds(local.bestThirds ?? [], slotCount),
              updatedAt: local.updatedAt || new Date().toISOString()
            }
          }
        }

        if (!next && !isLiveMode) {
          const seed = await fetchBracketPredictions({ mode })
          const seedDoc = seed.group.find((entry) => entry.userId === userId) ?? seed.group[0]
          if (seedDoc) {
            next = {
              groups: normalizeGroups(seedDoc.groups ?? {}, groupIds, groupTeamCodesByGroup),
              bestThirds: normalizeBestThirds(seedDoc.bestThirds ?? [], slotCount),
              updatedAt: seedDoc.updatedAt || new Date().toISOString()
            }
          }
        }

        const resolved = next ?? {
          ...empty,
          bestThirds: normalizeBestThirds(empty.bestThirds, slotCount)
        }

        saveLocalGroupStage(userId, resolved, mode)
        if (canceled) return
        setData(resolved)
        setSaveStatus('idle')
        setLoadState({ status: 'ready' })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (canceled) return
        setData({
          ...empty,
          bestThirds: normalizeBestThirds(empty.bestThirds, slotCount)
        })
        setLoadState({ status: 'error', message })
      }
    }

    void load()
    return () => {
      canceled = true
    }
  }, [authState.status, demoScenario, firestoreEnabled, groupIds, groupTeamCodesByGroup, isLiveMode, mode, userId])

  const setGroupPick = useCallback(
    (groupId: string, field: 'first' | 'second', value: string) => {
      if (isLocked) return
      const teamCodes = groupTeamCodesByGroup[groupId] ?? []
      const allowed = new Set(teamCodes)
      const normalized = value.trim().toUpperCase()
      const safeValue =
        normalized && (teamCodes.length === 0 || allowed.has(normalized)) ? normalized : undefined

      setData((current) => {
        const nextGroups = {
          ...current.groups,
          [groupId]: {
            ...(current.groups[groupId] ?? {})
          }
        }

        const pick = nextGroups[groupId]
        if (field === 'first') {
          pick.first = safeValue
          if (pick.second && pick.second === safeValue) pick.second = undefined
        } else {
          pick.second = safeValue
          if (pick.first && pick.first === safeValue) pick.first = undefined
        }
        // Any direct top-two edit invalidates persisted strict ranking.
        delete pick.ranking

        const next: GroupStageData = {
          ...current,
          groups: nextGroups,
          updatedAt: new Date().toISOString()
        }
        saveLocalGroupStage(userId, next, mode)
        return next
      })
      setSaveStatus('idle')
    },
    [groupTeamCodesByGroup, isLocked, mode, userId]
  )

  const setBestThird = useCallback(
    (index: number, value: string) => {
      if (isLocked) return
      setData((current) => {
        const slotCount = Math.max(DEFAULT_BEST_THIRD_SLOTS, current.bestThirds.length)
        const nextBestThirds = normalizeBestThirds(current.bestThirds, slotCount)
        nextBestThirds[index] = value || ''

        const next: GroupStageData = {
          ...current,
          bestThirds: nextBestThirds,
          updatedAt: new Date().toISOString()
        }
        saveLocalGroupStage(userId, next, mode)
        return next
      })
      setSaveStatus('idle')
    },
    [isLocked, mode, userId]
  )

  const setBestThirds = useCallback(
    (nextCodes: string[]) => {
      if (isLocked) return
      setData((current) => {
        const slotCount = Math.max(DEFAULT_BEST_THIRD_SLOTS, current.bestThirds.length, nextCodes.length)
        const nextBestThirds = normalizeBestThirds(
          nextCodes.map((code) => String(code ?? '').trim().toUpperCase()),
          slotCount
        )

        const next: GroupStageData = {
          ...current,
          bestThirds: nextBestThirds,
          updatedAt: new Date().toISOString()
        }
        saveLocalGroupStage(userId, next, mode)
        return next
      })
      setSaveStatus('idle')
    },
    [isLocked, mode, userId]
  )

  const save = useCallback(async (nextData?: GroupStageData): Promise<GroupStageSaveResult> => {
    const resolvedData = nextData
      ? {
          ...nextData,
          updatedAt: nextData.updatedAt || new Date().toISOString()
        }
      : data

    if (isLocked) {
      setForcedLocked(true)
      setSaveStatus('locked')
      return { ok: false, reason: 'locked' }
    }

    setSaveStatus('saving')
    if (!firestoreEnabled && isLiveMode) {
      setSaveStatus('error')
      return { ok: false, reason: 'error' }
    }

    try {
      const normalizedGroups = normalizeGroups(resolvedData.groups, groupIds, groupTeamCodesByGroup)
      const persistableData: GroupStageData = {
        ...resolvedData,
        groups: normalizedGroups,
        bestThirds: normalizeBestThirds(resolvedData.bestThirds, DEFAULT_BEST_THIRD_SLOTS)
      }
      const canonicalUserId = await resolveCanonicalUserId(userId)
      saveLocalGroupStage(canonicalUserId, persistableData, mode)
      if (firestoreEnabled) {
        await saveUserGroupStageDoc(canonicalUserId, persistableData.groups, persistableData.bestThirds)
        if (canonicalUserId !== userId) refreshCurrentUser()
      }
      if (nextData) {
        setData(persistableData)
      }
      setSaveStatus('saved')
      return { ok: true }
    } catch (error) {
      if (error instanceof FirebaseError) {
        console.error('saveGroupStage failed', error.code, error.message)
        if (error.code === 'permission-denied') refreshCurrentUser()
      }
      else console.error('saveGroupStage failed', error)
      setSaveStatus('error')
      return { ok: false, reason: 'error' }
    }
  }, [data, firestoreEnabled, groupIds, groupTeamCodesByGroup, isLiveMode, isLocked, mode, userId])

  const saveGroupRanking = useCallback(
    async (groupId: string, ranking: string[]): Promise<GroupRankingSaveResult> => {
      if (isLocked) {
        setForcedLocked(true)
        setSaveStatus('locked')
        return { ok: false, reason: 'locked' }
      }

      const teamCodes = groupTeamCodesByGroup[groupId] ?? []
      if (teamCodes.length === 0) {
        return {
          ok: true,
          changed: false,
          bestThirds: normalizeBestThirds(data.bestThirds, Math.max(DEFAULT_BEST_THIRD_SLOTS, data.bestThirds.length))
        }
      }
      const normalizedRanking = normalizeGroupRanking(ranking, teamCodes)
      if (normalizedRanking.length !== teamCodes.length) {
        return {
          ok: true,
          changed: false,
          bestThirds: normalizeBestThirds(data.bestThirds, Math.max(DEFAULT_BEST_THIRD_SLOTS, data.bestThirds.length))
        }
      }

      const currentGroup = data.groups[groupId] ?? {}
      const currentRanking = normalizeGroupRanking(currentGroup.ranking, teamCodes)
      const unchanged =
        currentRanking.length === normalizedRanking.length &&
        currentRanking.every((code, index) => code === normalizedRanking[index])
      if (unchanged) {
        return {
          ok: true,
          changed: false,
          bestThirds: normalizeBestThirds(data.bestThirds, Math.max(DEFAULT_BEST_THIRD_SLOTS, data.bestThirds.length))
        }
      }

      const nextGroup = applyGroupRanking(currentGroup, normalizedRanking, teamCodes)
      const previousThirdCode = currentRanking.length === teamCodes.length ? currentRanking[2] ?? '' : ''
      const nextThirdCode = normalizedRanking[2] ?? ''
      const slotCount = Math.max(DEFAULT_BEST_THIRD_SLOTS, data.bestThirds.length)
      let nextBestThirds = normalizeBestThirds(data.bestThirds, slotCount)

      if (previousThirdCode && nextThirdCode && previousThirdCode !== nextThirdCode) {
        let replaced = false
        nextBestThirds = nextBestThirds.map((code) => {
          if (code !== previousThirdCode) return code
          replaced = true
          return nextThirdCode
        })

        if (replaced) {
          const seen = new Set<string>()
          nextBestThirds = nextBestThirds.map((code) => {
            const normalized = String(code ?? '').trim().toUpperCase()
            if (!normalized || seen.has(normalized)) return ''
            seen.add(normalized)
            return normalized
          })
        }
      }

      const nextData: GroupStageData = {
        ...data,
        groups: {
          ...data.groups,
          [groupId]: nextGroup
        },
        bestThirds: nextBestThirds,
        updatedAt: new Date().toISOString()
      }

      setData(nextData)
      saveLocalGroupStage(userId, nextData, mode)
      const saveResult = await save(nextData)
      if (!saveResult.ok) return saveResult
      return { ok: true, changed: true, bestThirds: nextBestThirds }
    },
    [data, groupTeamCodesByGroup, isLocked, mode, save, userId]
  )

  return {
    loadState,
    data,
    groupIds,
    setGroupPick,
    saveGroupRanking,
    setBestThird,
    setBestThirds,
    save,
    saveStatus,
    canPersistFirestore: firestoreEnabled,
    isLocked
  }
}
