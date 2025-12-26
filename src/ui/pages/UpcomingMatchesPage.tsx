import { useEffect, useMemo, useState } from 'react'

import DayPagination from '../components/DayPagination'
import LockReminderBanner from '../components/LockReminderBanner'
import PicksBoard from '../components/PicksBoard'
import { getDateKeyInTimeZone } from '../../lib/matches'
import { usePicksData } from '../hooks/usePicksData'

export default function UpcomingMatchesPage() {
  const { state, picks, updatePicks } = usePicksData()
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const canShowKnockout = groupStageComplete

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    setView(canShowKnockout ? 'knockout' : 'group')
  }, [canShowKnockout, state, view])

  useEffect(() => {
    if (!canShowKnockout && view === 'knockout') setView('group')
  }, [canShowKnockout, view])

  const activeView = canShowKnockout ? view ?? 'group' : 'group'

  const availableGroups = useMemo(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.matches.filter(
      (match) => match.stage === 'Group' && match.status !== 'FINISHED'
    )
    const groups = new Set(
      groupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
    return [...groups].sort()
  }, [state])

  useEffect(() => {
    if (activeView !== 'group' && groupFilter !== 'all') {
      setGroupFilter('all')
    }
  }, [activeView, groupFilter])

  useEffect(() => {
    if (groupFilter !== 'all' && !availableGroups.includes(groupFilter)) {
      setGroupFilter('all')
    }
  }, [availableGroups, groupFilter])

  const filteredMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    let matches = state.matches.filter((match) => match.status !== 'FINISHED')
    matches =
      activeView === 'knockout'
        ? matches.filter((match) => match.stage !== 'Group')
        : matches.filter((match) => match.stage === 'Group')
    if (activeView === 'group' && groupFilter !== 'all') {
      matches = matches.filter((match) => match.group === groupFilter)
    }
    return matches.sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  }, [activeView, groupFilter, state])

  const dateKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const match of filteredMatches) {
      keys.add(getDateKeyInTimeZone(match.kickoffUtc))
    }
    return [...keys].sort((a, b) => a.localeCompare(b))
  }, [filteredMatches])

  useEffect(() => {
    if (dateKeys.length === 0) {
      setActiveDateKey(null)
      return
    }
    setActiveDateKey((current) =>
      current && dateKeys.includes(current) ? current : dateKeys[0]
    )
  }, [dateKeys])

  const upcomingMatches = useMemo(() => {
    if (!activeDateKey) return []
    return filteredMatches.filter(
      (match) => getDateKeyInTimeZone(match.kickoffUtc) === activeDateKey
    )
  }, [activeDateKey, filteredMatches])

  const showDayPagination = dateKeys.length > 1

  if (state.status === 'loading') return <div className="muted">Loading...</div>
  if (state.status === 'error') return <div className="error">{state.message}</div>

  return (
    <div className="stack">
      <LockReminderBanner matches={upcomingMatches} />
      <div className="card filtersPanel">
        <div className="filtersRow">
          {canShowKnockout ? (
            <div className="bracketToggle" role="tablist" aria-label="Upcoming matches view">
              <button
                className={
                  activeView === 'group' ? 'bracketToggleButton active' : 'bracketToggleButton'
                }
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
          ) : (
            <div className="filterCallout">Knockout matches unlock after group stage.</div>
          )}
        </div>
        {activeView === 'group' && availableGroups.length > 0 ? (
          <div className="filtersRow">
            <div className="groupFilter">
              <div className="groupFilterLabel">Group filter</div>
              <div className="groupFilterChips" role="tablist" aria-label="Group filter">
                <button
                  type="button"
                  role="tab"
                  aria-selected={groupFilter === 'all'}
                  className={
                    groupFilter === 'all' ? 'groupFilterChip active' : 'groupFilterChip'
                  }
                  onClick={() => setGroupFilter('all')}
                >
                  All groups
                </button>
                {availableGroups.map((group) => (
                  <button
                    key={group}
                    type="button"
                    role="tab"
                    aria-selected={groupFilter === group}
                    className={
                      groupFilter === group ? 'groupFilterChip active' : 'groupFilterChip'
                    }
                    onClick={() => setGroupFilter(group)}
                  >
                    Group {group}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {showDayPagination ? (
          <div className="filtersRow">
            <DayPagination
              dateKeys={dateKeys}
              activeDateKey={activeDateKey}
              onSelect={setActiveDateKey}
              ariaLabel="Upcoming match day"
            />
          </div>
        ) : null}
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
