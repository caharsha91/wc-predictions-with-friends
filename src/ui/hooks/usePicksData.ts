import { useEffect, useState } from 'react'

import { fetchMatches, fetchPicks } from '../../lib/data'
import { loadLocalPicks, saveLocalPicks } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useViewerId } from './useViewerId'

type PicksLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[] }

export function usePicksData() {
  const userId = useViewerId()
  const [state, setState] = useState<PicksLoadState>({ status: 'loading' })
  const [picks, setPicks] = useState<Pick[]>(() => loadLocalPicks(userId))

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, picksFile] = await Promise.all([fetchMatches(), fetchPicks()])
        if (canceled) return

        const stored = loadLocalPicks(userId)
        if (stored.length > 0) {
          setPicks(stored)
        } else {
          const seeded = picksFile.picks.filter((pick) => pick.userId === userId)
          if (seeded.length > 0) {
            setPicks(seeded)
            saveLocalPicks(userId, seeded)
          }
        }

        setState({ status: 'ready', matches: matchesFile.matches })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [userId])

  function updatePicks(nextPicks: Pick[]) {
    setPicks(nextPicks)
    saveLocalPicks(userId, nextPicks)
  }

  return { state, picks, updatePicks }
}
