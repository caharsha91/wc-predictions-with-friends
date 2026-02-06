import { useCallback, useEffect, useMemo, useState } from 'react'

import { combineBracketPredictions, loadLocalBracketPrediction, saveLocalBracketPrediction } from '../../lib/bracket'
import { fetchBracketPredictions } from '../../lib/data'
import { fetchUserBracketGroupDoc, saveUserBracketGroupDoc } from '../../lib/firestoreData'
import { hasFirebase } from '../../lib/firebase'
import type { GroupPrediction } from '../../types/bracket'
import type { Match } from '../../types/matches'
import { useAuthState } from './useAuthState'
import { useCurrentUser } from './useCurrentUser'
import { useViewerId } from './useViewerId'

const DEFAULT_BEST_THIRD_SLOTS = 8

type GroupOutcomesLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

type GroupOutcomesData = {
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

function createEmptyData(groupIds: string[]): GroupOutcomesData {
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

function saveLocalGroupOutcomes(userId: string, data: GroupOutcomesData) {
  const existing = loadLocalBracketPrediction(userId)
  const updatedAt = data.updatedAt || new Date().toISOString()
  saveLocalBracketPrediction(userId, {
    id: existing?.id ?? `bracket-${userId}`,
    userId,
    groups: data.groups,
    bestThirds: data.bestThirds,
    knockout: existing?.knockout ?? {},
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt
  })
}

export function useGroupOutcomesData(matches: Match[]) {
  const authState = useAuthState()
  const currentUser = useCurrentUser()
  const userId = useViewerId()
  const groupIds = useMemo(() => buildGroupIds(matches), [matches])
  const [loadState, setLoadState] = useState<GroupOutcomesLoadState>({ status: 'loading' })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [data, setData] = useState<GroupOutcomesData>(() => createEmptyData(groupIds))

  const firestoreEnabled =
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
        let next: GroupOutcomesData | null = null

        if (firestoreEnabled) {
          const remote = await fetchUserBracketGroupDoc(userId)
          if (remote) {
            next = {
              groups: normalizeGroups(remote.groups ?? {}, groupIds),
              bestThirds: normalizeBestThirds(remote.bestThirds ?? [], slotCount),
              updatedAt: new Date().toISOString()
            }
          }
        }

        if (!next) {
          const local = loadLocalBracketPrediction(userId)
          if (local && hasAnyGroupSelection(local.groups ?? {}, local.bestThirds ?? [])) {
            next = {
              groups: normalizeGroups(local.groups ?? {}, groupIds),
              bestThirds: normalizeBestThirds(local.bestThirds ?? [], slotCount),
              updatedAt: local.updatedAt || new Date().toISOString()
            }
          }
        }

        if (!next) {
          const seed = await fetchBracketPredictions()
          const predictions = combineBracketPredictions(seed)
          const fallback = predictions.find((entry) => entry.userId === userId) ?? predictions[0]
          if (fallback) {
            next = {
              groups: normalizeGroups(fallback.groups ?? {}, groupIds),
              bestThirds: normalizeBestThirds(fallback.bestThirds ?? [], slotCount),
              updatedAt: fallback.updatedAt || new Date().toISOString()
            }
          }
        }

        const resolved = next ?? {
          ...empty,
          bestThirds: normalizeBestThirds(empty.bestThirds, slotCount)
        }
        saveLocalGroupOutcomes(userId, resolved)
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
  }, [authState.status, firestoreEnabled, groupIds, userId])

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
        const next: GroupOutcomesData = {
          ...current,
          groups: nextGroups,
          updatedAt: new Date().toISOString()
        }
        saveLocalGroupOutcomes(userId, next)
        return next
      })
      setSaveStatus('idle')
    },
    [userId]
  )

  const setBestThird = useCallback(
    (index: number, value: string) => {
      setData((current) => {
        const slotCount = Math.max(DEFAULT_BEST_THIRD_SLOTS, current.bestThirds.length)
        const nextBestThirds = normalizeBestThirds(current.bestThirds, slotCount)
        const normalized = value || ''
        if (normalized) {
          for (let i = 0; i < nextBestThirds.length; i += 1) {
            if (i !== index && nextBestThirds[i] === normalized) {
              nextBestThirds[i] = ''
            }
          }
        }
        nextBestThirds[index] = normalized
        const next: GroupOutcomesData = {
          ...current,
          bestThirds: nextBestThirds,
          updatedAt: new Date().toISOString()
        }
        saveLocalGroupOutcomes(userId, next)
        return next
      })
      setSaveStatus('idle')
    },
    [userId]
  )

  const save = useCallback(async () => {
    setSaveStatus('saving')
    try {
      saveLocalGroupOutcomes(userId, data)
      if (firestoreEnabled) {
        await saveUserBracketGroupDoc(userId, data.groups, data.bestThirds)
      }
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }, [data, firestoreEnabled, userId])

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
