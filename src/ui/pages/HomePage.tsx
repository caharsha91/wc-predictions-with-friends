import { useMemo } from 'react'

import { getDateKeyLocal } from '../../lib/matches'
import PicksBoard from '../components/PicksBoard'
import { usePicksData } from '../hooks/usePicksData'

export default function HomePage() {
  const { state, picks, updatePicks } = usePicksData()

  const nextMatchday = useMemo(() => {
    if (state.status !== 'ready') return null
    const upcoming = state.matches
      .filter((match) => match.status !== 'FINISHED')
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
    if (upcoming.length === 0) return null
    const dateKey = getDateKeyLocal(upcoming[0].kickoffUtc)
    return {
      dateKey,
      matches: upcoming.filter((match) => getDateKeyLocal(match.kickoffUtc) === dateKey)
    }
  }, [state])

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>

  const matches = nextMatchday ? nextMatchday.matches : []

  return (
    <PicksBoard
      matches={matches}
      picks={picks}
      onUpdatePicks={updatePicks}
      kicker="Next Matchday"
      title="Upcoming Picks"
      emptyMessage="No upcoming matches."
      highlightMissing
    />
  )
}
