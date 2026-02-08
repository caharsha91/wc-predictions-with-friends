import { useCallback, useEffect, useMemo, useState } from 'react'

import { loadLocalBracketPrediction, saveLocalBracketPrediction } from '../../lib/bracket'
import { fetchBracketPredictions } from '../../lib/data'
import { fetchUserGroupStageDoc, saveUserGroupStageDoc } from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import type { GroupPrediction } from '../../types/bracket'
import type { Match } from '../../types/matches'
import { useAuthState } from './useAuthState'
import { useCurrentUser } from './useCurrentUser'
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

function buildGroupIds(matches: Match[]): string[] {
  const ids = new Set<string>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    ids.add(match.group)
  }
  return [...ids].sort()
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
  groupIds: string[]
): Record<string, GroupPrediction> {
  const next = { ...groups }
  for (const groupId of groupIds) {
    if (!next[groupId]) next[groupId] = {}
  }
  return next
}

function normalizeBestThirds(bestThirds: string[] | undefined, slotCount: number): string[] {
  const next = Array.isArray(bestThirds) ? [...bestThirds] : []
  while (next.length < slotCount) next.push('')
  return next.slice(0, slotCount)
}

function hasAnyGroupSelection(groups: Record<string, GroupPrediction>, bestThirds: string[]): boolean {
  for (const group of Object.values(groups)) {
    if (group?.first || group?.second) return true
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
  const userId = useViewerId()
  const groupIds = useMemo(() => buildGroupIds(matches), [matches])

  const [loadState, setLoadState] = useState<GroupStageLoadState>({ status: 'loading' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [data, setData] = useState<GroupStageData>(() => createEmptyData(groupIds))

  const firestoreEnabled =
    !isDemoMode &&
    hasFirebase &&
    authState.status === 'ready' &&
    !!authState.user &&
    currentUser?.isMember === true

  useEffect(() => {
    let canceled = false

    async function load() {
      if (groupIds.length === 0) {
        setData(createEmptyData([]))
        setLoadState({ status: 'ready' })
        return
      }
      if (hasFirebase && authState.status === 'loading') return

      setLoadState({ status: 'loading' })
      const slotCount = DEFAULT_BEST_THIRD_SLOTS
      const empty = createEmptyData(groupIds)

      try {
        let next: GroupStageData | null = null

        if (firestoreEnabled) {
          const remote = await fetchUserGroupStageDoc(userId)
          if (remote) {
            next = {
              groups: normalizeGroups(remote.groups ?? {}, groupIds),
              bestThirds: normalizeBestThirds(remote.bestThirds ?? [], slotCount),
              updatedAt: new Date().toISOString()
            }
          }
        }

        if (!next) {
          const local = loadLocalBracketPrediction(userId, mode)
          if (local && hasAnyGroupSelection(local.groups ?? {}, local.bestThirds ?? [])) {
            next = {
              groups: normalizeGroups(local.groups ?? {}, groupIds),
              bestThirds: normalizeBestThirds(local.bestThirds ?? [], slotCount),
              updatedAt: local.updatedAt || new Date().toISOString()
            }
          }
        }

        if (!next) {
          const seed = await fetchBracketPredictions({ mode })
          const seedDoc = seed.group.find((entry) => entry.userId === userId) ?? seed.group[0]
          if (seedDoc) {
            next = {
              groups: normalizeGroups(seedDoc.groups ?? {}, groupIds),
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
  }, [authState.status, firestoreEnabled, groupIds, mode, userId])

  const setGroupPick = useCallback(
    (groupId: string, field: 'first' | 'second', value: string) => {
      setData((current) => {
        const nextGroups = {
          ...current.groups,
          [groupId]: {
            ...(current.groups[groupId] ?? {})
          }
        }

        const pick = nextGroups[groupId]
        const normalized = value || undefined
        if (field === 'first') {
          pick.first = normalized
          if (pick.second && pick.second === normalized) pick.second = undefined
        } else {
          pick.second = normalized
          if (pick.first && pick.first === normalized) pick.first = undefined
        }

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
    [mode, userId]
  )

  const setBestThird = useCallback(
    (index: number, value: string) => {
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
    [mode, userId]
  )

  const save = useCallback(async () => {
    setSaveStatus('saving')
    try {
      saveLocalGroupStage(userId, data, mode)
      if (firestoreEnabled) {
        await saveUserGroupStageDoc(userId, data.groups, data.bestThirds)
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [data, firestoreEnabled, mode, userId])

  return {
    loadState,
    data,
    groupIds,
    setGroupPick,
    setBestThird,
    save,
    saveStatus,
    canPersistFirestore: firestoreEnabled
  }
}
