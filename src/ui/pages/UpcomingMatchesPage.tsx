import { useMemo } from 'react'

import PicksBoard from '../components/PicksBoard'
import { usePicksData } from '../hooks/usePicksData'

export default function UpcomingMatchesPage() {
  const { state, picks, updatePicks } = usePicksData()

  const upcomingMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches
      .filter((match) => match.status !== 'FINISHED')
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  }, [state])

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>

  return (
    <PicksBoard
      matches={upcomingMatches}
      picks={picks}
      onUpdatePicks={updatePicks}
      kicker="Upcoming Matches"
      title="All Remaining Matches"
      emptyMessage="No upcoming matches."
    />
  )
}
