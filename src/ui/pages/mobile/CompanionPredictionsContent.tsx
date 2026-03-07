import { useEffect, useMemo, useState } from 'react'

import { isStrictGroupRanking } from '../../../lib/groupRanking'
import { findPick, isPickComplete, upsertPick } from '../../../lib/picks'
import type { Match, MatchWinner } from '../../../types/matches'
import type { Pick, PickAdvances } from '../../../types/picks'
import type { KnockoutStage } from '../../../types/scoring'
import MatchPick, { type MatchPickChange, type MatchPickDecidedIn } from '../../components/MatchPick'
import { Button } from '../../components/ui/Button'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import StatusTagV2 from '../../components/v2/StatusTagV2'
import { useTournamentPhaseState } from '../../context/TournamentPhaseContext'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useViewerId } from '../../hooks/useViewerId'
import { computeMatchTimelineModel } from '../../lib/matchTimeline'
import { resolveTeamFlagMeta } from '../../lib/teamFlag'

const QUICK_MATCH_EDIT_LIMIT = 6
const BEST_THIRD_TARGET = 8

const KNOCKOUT_STAGE_LABELS: Record<KnockoutStage, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  Third: 'Third place',
  Final: 'Final'
}

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

function isTbdTeam(code: string | undefined, name: string | undefined): boolean {
  const codeValue = String(code ?? '').trim().toUpperCase()
  const nameValue = String(name ?? '').trim().toUpperCase()
  return codeValue === 'TBD' || nameValue === 'TBD' || nameValue === 'TO BE DECIDED'
}

function buildGroupTeams(matches: Match[]): Record<string, string[]> {
  const groups = new Map<string, Set<string>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const existing = groups.get(match.group) ?? new Set<string>()
    existing.add(match.homeTeam.code)
    existing.add(match.awayTeam.code)
    groups.set(match.group, existing)
  }

  const grouped: Record<string, string[]> = {}
  for (const [groupId, teamSet] of groups.entries()) {
    grouped[groupId] = [...teamSet.values()].sort((left, right) => left.localeCompare(right))
  }
  return grouped
}

function CompactMessage({ children }: { children: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{children}</div>
}

export default function CompanionPredictionsContent() {
  const phaseState = useTournamentPhaseState()
  const now = useNow({ tickMs: 30_000 })
  const viewerId = useViewerId()
  const picksState = usePicksData()
  const knockoutData = useBracketKnockoutData()

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)
  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])

  const [workingPicks, setWorkingPicks] = useState<Pick[]>([])
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null)
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null)
  const [matchErrors, setMatchErrors] = useState<Record<string, string>>({})

  const [savingKnockout, setSavingKnockout] = useState(false)
  const [savedKnockout, setSavedKnockout] = useState(false)
  const [knockoutError, setKnockoutError] = useState<string | null>(null)

  useEffect(() => {
    setWorkingPicks(picksState.picks)
  }, [picksState.picks])

  useEffect(() => {
    if (!savedMatchId) return
    const timer = window.setTimeout(() => setSavedMatchId(null), 1800)
    return () => window.clearTimeout(timer)
  }, [savedMatchId])

  useEffect(() => {
    if (!savedKnockout) return
    const timer = window.setTimeout(() => setSavedKnockout(false), 1800)
    return () => window.clearTimeout(timer)
  }, [savedKnockout])

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

  const knockoutRounds = useMemo(() => {
    const loadState = knockoutData.loadState
    if (loadState.status !== 'ready') {
      return [] as Array<{ stage: KnockoutStage; total: number; picked: number }>
    }

    return knockoutData.stageOrder
      .map((stage) => {
        const stageMatches: Match[] = loadState.byStage[stage] ?? []
        if (stageMatches.length === 0) return null
        const stagePicks = knockoutData.knockout[stage] ?? {}
        const picked = stageMatches.filter((match) => Boolean(stagePicks[match.id])).length
        return {
          stage,
          total: stageMatches.length,
          picked
        }
      })
      .filter((row): row is { stage: KnockoutStage; total: number; picked: number } => Boolean(row))
  }, [knockoutData.knockout, knockoutData.loadState, knockoutData.stageOrder])

  const activeKnockoutStage = useMemo(() => {
    if (knockoutRounds.length === 0) return null
    const firstPending = knockoutRounds.find((round) => round.picked < round.total)
    return firstPending?.stage ?? knockoutRounds[0]!.stage
  }, [knockoutRounds])

  const activeKnockoutRound = useMemo(() => {
    if (!activeKnockoutStage || knockoutData.loadState.status !== 'ready') return null
    const stageMatches = knockoutData.loadState.byStage[activeKnockoutStage] ?? []
    const stagePicks = knockoutData.knockout[activeKnockoutStage] ?? {}
    const picked = stageMatches.filter((match) => Boolean(stagePicks[match.id])).length
    return {
      stage: activeKnockoutStage,
      matches: stageMatches,
      picked,
      total: stageMatches.length,
      picksByMatchId: stagePicks
    }
  }, [activeKnockoutStage, knockoutData.knockout, knockoutData.loadState])

  const drawConfirmed =
    phaseState.tournamentPhase === 'KO_OPEN' ||
    phaseState.tournamentPhase === 'KO_LOCKED' ||
    phaseState.tournamentPhase === 'FINAL'
  const knockoutEditable = drawConfirmed && phaseState.lockFlags.bracketEditable && Boolean(activeKnockoutRound)

  function setKnockoutWinner(matchId: string, winner: MatchWinner) {
    if (!activeKnockoutRound || !knockoutEditable) return
    knockoutData.setPick(activeKnockoutRound.stage, matchId, winner)
    setSavedKnockout(false)
    setKnockoutError(null)
  }

  async function saveKnockoutRound() {
    if (!activeKnockoutRound) return

    setSavingKnockout(true)
    setKnockoutError(null)
    setSavedKnockout(false)

    const ok = await knockoutData.save()
    if (ok) setSavedKnockout(true)
    else setKnockoutError('Unable to save knockout picks right now.')

    setSavingKnockout(false)
  }

  const groupSummary = useMemo(() => {
    const groupsTotal = groupStage.groupIds.length
    let groupsDone = 0

    for (const groupId of groupStage.groupIds) {
      const group = groupStage.data.groups[groupId]
      const teamCodes = groupTeams[groupId] ?? []
      if (teamCodes.length > 0 && isStrictGroupRanking(group?.ranking, teamCodes)) groupsDone += 1
    }

    const bestThirdDone = groupStage.data.bestThirds.filter((code) => Boolean(String(code ?? '').trim())).length
    const pending = Math.max(0, groupsTotal - groupsDone) + Math.max(0, BEST_THIRD_TARGET - bestThirdDone)

    return {
      groupsDone,
      groupsTotal,
      bestThirdDone,
      pending
    }
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds, groupTeams])

  return (
    <>
      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Quick Match Edits</div>
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

      {drawConfirmed ? (
        <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="v2-type-kicker">Bracket Edits</div>
            <StatusTagV2 tone={knockoutEditable ? 'info' : 'locked'}>
              {knockoutEditable ? 'Open' : 'Locked'}
            </StatusTagV2>
          </div>

          {knockoutData.loadState.status === 'loading' ? (
            <CompactMessage>Loading bracket picks…</CompactMessage>
          ) : knockoutData.loadState.status === 'error' ? (
            <CompactMessage>{knockoutData.loadState.message}</CompactMessage>
          ) : !activeKnockoutRound ? (
            <CompactMessage>No active bracket round yet.</CompactMessage>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
                <span className="text-muted-foreground">{KNOCKOUT_STAGE_LABELS[activeKnockoutRound.stage]}</span>
                <span className="font-semibold text-foreground">
                  {activeKnockoutRound.picked}/{activeKnockoutRound.total}
                </span>
              </div>

              <div className="space-y-2">
                {activeKnockoutRound.matches.map((match) => {
                  const selected = activeKnockoutRound.picksByMatchId[match.id]
                  const homeDisabled = !knockoutEditable || isTbdTeam(match.homeTeam.code, match.homeTeam.name)
                  const awayDisabled = !knockoutEditable || isTbdTeam(match.awayTeam.code, match.awayTeam.name)

                  return (
                    <div key={match.id} className="space-y-2 border-b border-border/60 pb-2 last:border-b-0">
                      <div className="v2-type-caption text-muted-foreground">
                        {new Date(match.kickoffUtc).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="grid gap-2">
                        <Button
                          variant={selected === 'HOME' ? 'pill' : 'secondary'}
                          size="sm"
                          data-active={selected === 'HOME'}
                          disabled={homeDisabled}
                          onClick={() => setKnockoutWinner(match.id, 'HOME')}
                        >
                          {match.homeTeam.code} · {match.homeTeam.name}
                        </Button>
                        <Button
                          variant={selected === 'AWAY' ? 'pill' : 'secondary'}
                          size="sm"
                          data-active={selected === 'AWAY'}
                          disabled={awayDisabled}
                          onClick={() => setKnockoutWinner(match.id, 'AWAY')}
                        >
                          {match.awayTeam.code} · {match.awayTeam.name}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={savingKnockout}
                  disabled={!knockoutEditable || savingKnockout}
                  onClick={() => void saveKnockoutRound()}
                >
                  Save round
                </Button>
                {savedKnockout ? <StatusTagV2 tone="success">Saved</StatusTagV2> : null}
              </div>
              {knockoutError ? <CompactMessage>{knockoutError}</CompactMessage> : null}
            </>
          )}
        </SectionCardV2>
      ) : null}

      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Group Status</div>
          <StatusTagV2 tone={groupSummary.pending > 0 ? 'warning' : 'success'}>
            {groupSummary.pending > 0 ? `${groupSummary.pending} pending` : 'Complete'}
          </StatusTagV2>
        </div>

        {groupStage.loadState.status === 'loading' ? (
          <CompactMessage>Loading group status…</CompactMessage>
        ) : groupStage.loadState.status === 'error' ? (
          <CompactMessage>{groupStage.loadState.message}</CompactMessage>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Groups</div>
              <div className="font-semibold text-foreground">
                {groupSummary.groupsDone}/{groupSummary.groupsTotal}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Best 3rd</div>
              <div className="font-semibold text-foreground">{groupSummary.bestThirdDone}/{BEST_THIRD_TARGET}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Pending</div>
              <div className="font-semibold text-foreground">{groupSummary.pending}</div>
            </div>
          </div>
        )}
      </SectionCardV2>
    </>
  )
}
