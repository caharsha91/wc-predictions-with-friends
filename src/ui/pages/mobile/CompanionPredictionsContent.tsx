import { useEffect, useMemo, useState } from 'react'

import { findPick, isPickComplete, upsertPick } from '../../../lib/picks'
import type { Match } from '../../../types/matches'
import type { Pick, PickAdvances } from '../../../types/picks'
import MatchPick, { type MatchPickChange, type MatchPickDecidedIn } from '../../components/MatchPick'
import { Button } from '../../components/ui/Button'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import StatusTagV2 from '../../components/v2/StatusTagV2'
import { useTournamentPhaseState } from '../../context/TournamentPhaseContext'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useViewerId } from '../../hooks/useViewerId'
import { computeMatchTimelineModel } from '../../lib/matchTimeline'
import { resolveTeamFlagMeta } from '../../lib/teamFlag'

const QUICK_MATCH_EDIT_LIMIT = 6

function toMatchPickDecidedIn(value: Pick['decidedBy']): MatchPickDecidedIn {
  if (value === 'ET') return 'AET'
  if (value === 'PENS') return 'PEN'
  return 'REG'
}

function toPickDecidedBy(value: MatchPickDecidedIn): Pick['decidedBy'] {
  if (value === 'AET') return 'ET'
  if (value === 'PEN') return 'PENS'
  return undefined
}

function toSelectedWinnerId(value: Pick['advances']): string | undefined {
  if (value === 'HOME') return 'HOME'
  if (value === 'AWAY') return 'AWAY'
  return undefined
}

function isPickDirty(basePick: Pick | undefined, workingPick: Pick | undefined): boolean {
  const base = {
    homeScore: basePick?.homeScore,
    awayScore: basePick?.awayScore,
    advances: basePick?.advances,
    decidedBy: basePick?.decidedBy
  }
  const working = {
    homeScore: workingPick?.homeScore,
    awayScore: workingPick?.awayScore,
    advances: workingPick?.advances,
    decidedBy: workingPick?.decidedBy
  }
  return JSON.stringify(base) !== JSON.stringify(working)
}

function CompactMessage({ children }: { children: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{children}</div>
}

export default function CompanionPredictionsContent() {
  const phaseState = useTournamentPhaseState()
  const now = useNow({ tickMs: 30_000 })
  const viewerId = useViewerId()
  const picksState = usePicksData()

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []

  const [workingPicks, setWorkingPicks] = useState<Pick[]>([])
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null)
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null)
  const [matchErrors, setMatchErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setWorkingPicks(picksState.picks)
  }, [picksState.picks])

  useEffect(() => {
    if (!savedMatchId) return
    const timer = window.setTimeout(() => setSavedMatchId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [savedMatchId])

  const quickMatchItems = useMemo(() => {
    if (picksState.state.status !== 'ready') return []
    const timeline = computeMatchTimelineModel(matches, now.toISOString(), {
      matchPicksEditable: phaseState.lockFlags.matchPicksEditable
    })
    return timeline.upcoming.filter((item) => item.editable).slice(0, QUICK_MATCH_EDIT_LIMIT)
  }, [matches, now, phaseState.lockFlags.matchPicksEditable, picksState.state.status])

  const workingPicksByMatchId = useMemo(
    () => new Map(workingPicks.map((pick) => [pick.matchId, pick])),
    [workingPicks]
  )

  const baselinePicksByMatchId = useMemo(
    () => new Map(picksState.picks.map((pick) => [pick.matchId, pick])),
    [picksState.picks]
  )

  const quickMatchPending = useMemo(() => {
    return quickMatchItems.reduce((count, item) => {
      const pick = workingPicksByMatchId.get(item.match.id)
      return count + (isPickComplete(item.match, pick) ? 0 : 1)
    }, 0)
  }, [quickMatchItems, workingPicksByMatchId])

  function handleMatchPickChange(next: MatchPickChange) {
    setWorkingPicks((current) =>
      upsertPick(current, {
        matchId: next.matchId,
        userId: viewerId,
        homeScore: next.scoreA,
        awayScore: next.scoreB,
        advances:
          next.selectedWinnerId === 'HOME' || next.selectedWinnerId === 'AWAY'
            ? (next.selectedWinnerId as PickAdvances)
            : undefined,
        decidedBy: toPickDecidedBy(next.decidedIn)
      })
    )

    setMatchErrors((current) => {
      if (!current[next.matchId]) return current
      const nextErrors = { ...current }
      delete nextErrors[next.matchId]
      return nextErrors
    })
    setSavedMatchId(null)
  }

  async function saveMatchPick(match: Match) {
    const pick = findPick(workingPicks, match.id, viewerId)
    if (!isPickComplete(match, pick)) {
      setMatchErrors((current) => ({
        ...current,
        [match.id]: 'Complete score + winner before saving.'
      }))
      return
    }

    setSavingMatchId(match.id)
    setMatchErrors((current) => {
      if (!current[match.id]) return current
      const nextErrors = { ...current }
      delete nextErrors[match.id]
      return nextErrors
    })

    try {
      picksState.updatePicks(workingPicks)
      await picksState.savePicks(workingPicks)
      setSavedMatchId(match.id)
    } catch (error) {
      setMatchErrors((current) => ({
        ...current,
        [match.id]: error instanceof Error ? error.message : 'Unable to save pick right now.'
      }))
    } finally {
      setSavingMatchId(null)
    }
  }

  return (
    <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="v2-type-kicker">Match Picks</div>
        <StatusTagV2 tone={quickMatchPending > 0 ? 'warning' : 'success'}>
          {quickMatchPending > 0 ? `${quickMatchPending} pending` : 'Up to date'}
        </StatusTagV2>
      </div>

      {picksState.state.status === 'loading' ? (
        <CompactMessage>Loading editable matches…</CompactMessage>
      ) : picksState.state.status === 'error' ? (
        <CompactMessage>{picksState.state.message}</CompactMessage>
      ) : quickMatchItems.length === 0 ? (
        <CompactMessage>No editable matches right now.</CompactMessage>
      ) : (
        <div className="space-y-3">
          {quickMatchItems.map((item) => {
            const match = item.match
            const workingPick = workingPicksByMatchId.get(match.id)
            const baselinePick = baselinePicksByMatchId.get(match.id)
            const dirty = isPickDirty(baselinePick, workingPick)
            const rowError = matchErrors[match.id]

            return (
              <div key={match.id} className="space-y-2 border-b border-border/60 pb-2 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="v2-type-caption text-muted-foreground">
                    {match.stage} •{' '}
                    {new Date(match.kickoffUtc).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {savedMatchId === match.id ? <StatusTagV2 tone="success">Saved</StatusTagV2> : null}
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={!dirty || savingMatchId === match.id || !item.editable}
                      loading={savingMatchId === match.id}
                      onClick={() => void saveMatchPick(match)}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <MatchPick
                  matchId={match.id}
                  isKnockout={match.stage !== 'Group'}
                  teamA={{
                    id: 'HOME',
                    name: match.homeTeam.name,
                    abbr: match.homeTeam.code,
                    flagUrl: resolveTeamFlagMeta({ code: match.homeTeam.code, name: match.homeTeam.name }).assetPath
                  }}
                  teamB={{
                    id: 'AWAY',
                    name: match.awayTeam.name,
                    abbr: match.awayTeam.code,
                    flagUrl: resolveTeamFlagMeta({ code: match.awayTeam.code, name: match.awayTeam.name }).assetPath
                  }}
                  scoreA={workingPick?.homeScore}
                  scoreB={workingPick?.awayScore}
                  decidedIn={toMatchPickDecidedIn(workingPick?.decidedBy)}
                  selectedWinnerId={toSelectedWinnerId(workingPick?.advances)}
                  disabled={!item.editable}
                  onChange={handleMatchPickChange}
                />

                {rowError ? <CompactMessage>{rowError}</CompactMessage> : null}
              </div>
            )
          })}
        </div>
      )}
    </SectionCardV2>
  )
}
