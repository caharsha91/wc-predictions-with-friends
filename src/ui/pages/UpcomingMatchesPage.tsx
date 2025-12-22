import { useEffect, useMemo, useState } from 'react'

import LockReminderBanner from '../components/LockReminderBanner'
import PicksBoard from '../components/PicksBoard'
import { usePicksData } from '../hooks/usePicksData'

export default function UpcomingMatchesPage() {
  const { state, picks, updatePicks } = usePicksData()
  const [view, setView] = useState<'group' | 'knockout' | null>(null)

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const upcomingMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches
      .filter((match) => match.status !== 'FINISHED')
      .filter((match) =>
        view === 'knockout' ? match.stage !== 'Group' : match.stage === 'Group'
      )
      .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  }, [state, view])

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    setView(groupStageComplete ? 'knockout' : 'group')
  }, [groupStageComplete, state, view])

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>
  const activeView = view ?? 'group'

  return (
    <div className="stack">
      <LockReminderBanner matches={upcomingMatches} />
      <div className="bracketToggle" role="tablist" aria-label="Upcoming matches view">
        <button
          className={activeView === 'group' ? 'bracketToggleButton active' : 'bracketToggleButton'}
          type="button"
          role="tab"
          aria-selected={activeView === 'group'}
          onClick={() => setView('group')}
        >
          Group stage
        </button>
        <button
          className={
            activeView === 'knockout' ? 'bracketToggleButton active' : 'bracketToggleButton'
          }
          type="button"
          role="tab"
          aria-selected={activeView === 'knockout'}
          onClick={() => setView('knockout')}
        >
          Knockout
        </button>
      </div>
      <PicksBoard
        matches={upcomingMatches}
        picks={picks}
        onUpdatePicks={updatePicks}
        kicker="Upcoming Matches"
        title="All Remaining Matches"
        emptyMessage="No upcoming matches."
      />
    </div>
  )
}
