import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { getGroupOutcomesLockTime } from '../../lib/matches'
import { isMatchLocked } from '../../lib/matches'
import type { Match } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import DetailQuickMenu from '../components/ui/DetailQuickMenu'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'

const STAGE_LABELS: Record<KnockoutStage, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  Third: 'Third Place',
  Final: 'Final'
}

type BracketEntry = {
  stage: KnockoutStage
  match: Match
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function winnerLabel(winner: 'HOME' | 'AWAY' | undefined, match: Match): string {
  if (!winner) return '—'
  return winner === 'HOME' ? match.homeTeam.code : match.awayTeam.code
}

function resolvedTeamCode(code?: string): boolean {
  return /^[A-Z]{3}$/.test((code ?? '').trim().toUpperCase())
}

export default function BracketPage() {
  const location = useLocation()
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const bracket = useBracketKnockoutData()
  const readyBracketState = bracket.loadState.status === 'ready' ? bracket.loadState : null

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks' | 'group-stage' | 'bracket' | 'league') =>
    segment ? `${playRoot}/${segment}` : playRoot

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false

  const knockoutMatchesFromFixtures = useMemo(
    () => matches.filter((match) => match.stage !== 'Group'),
    [matches]
  )

  const roundOf32Matches = useMemo(
    () => knockoutMatchesFromFixtures.filter((match) => match.stage === 'R32'),
    [knockoutMatchesFromFixtures]
  )

  const drawReady = useMemo(
    () =>
      roundOf32Matches.length > 0 &&
      roundOf32Matches.every(
        (match) => resolvedTeamCode(match.homeTeam.code) && resolvedTeamCode(match.awayTeam.code)
      ),
    [roundOf32Matches]
  )

  const unlocked = groupClosed && drawReady

  const entries = useMemo<BracketEntry[]>(() => {
    if (!readyBracketState) return []
    return bracket.stageOrder.flatMap((stage) =>
      (readyBracketState.byStage[stage] ?? []).map((match) => ({ stage, match }))
    )
  }, [readyBracketState, bracket.stageOrder])

  const stageSummary = useMemo(
    () =>
      bracket.stageOrder
        .map((stage) => {
          if (!readyBracketState) return null
          const stageMatches = readyBracketState.byStage[stage] ?? []
          if (stageMatches.length === 0) return null
          const picked = stageMatches.filter((match) => Boolean(bracket.knockout[stage]?.[match.id])).length
          const locked = stageMatches.filter((match) => isMatchLocked(match.kickoffUtc, now)).length
          return { stage, total: stageMatches.length, picked, locked }
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value)),
    [readyBracketState, bracket.knockout, bracket.stageOrder, now]
  )

  if (picksState.state.status === 'loading' || bracket.loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load bracket detail">
        {picksState.state.message}
      </Alert>
    )
  }

  if (bracket.loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load bracket detail">
        {bracket.loadState.message}
      </Alert>
    )
  }

  const latestUpdated = readyBracketState?.lastUpdated

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Knockout"
        title="Knockout Detail"
        subtitle="Read-only bracket picks and results. Use Play Center for guided edits."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(latestUpdated)}</div>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={groupClosed ? 'success' : 'warning'}>
                  Group lock {groupClosed ? 'closed' : 'open'}
                </Badge>
                <Badge tone={drawReady ? 'success' : 'warning'}>
                  Draw {drawReady ? 'confirmed' : 'pending'}
                </Badge>
                <Badge tone={unlocked ? 'info' : 'locked'}>{unlocked ? 'Detail active' : 'Detail inactive'}</Badge>
              </div>

              {!unlocked ? (
                <Alert tone="info" title="Knockout detail is inactive">
                  Unlocks after group-stage closes and knockout draw confirmation from fixture completeness.
                </Alert>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Read-only bracket picks and results are shown below.
                </div>
              )}
            </div>
          </Card>

          <DetailQuickMenu
            stats={[
              { label: 'Picked', value: `${bracket.completeMatches}/${bracket.totalMatches}` },
              { label: 'Stages', value: stageSummary.length },
              { label: 'Group lock', value: groupClosed ? 'Closed' : 'Open' },
              { label: 'Draw', value: drawReady ? 'Ready' : 'Pending' }
            ]}
            links={[
              { label: 'Back to Play Center', to: toPlayPath() },
              { label: 'Picks Detail', to: toPlayPath('picks') },
              { label: 'Group Stage Detail', to: toPlayPath('group-stage') },
              { label: 'Knockout Detail', to: toPlayPath('bracket') },
              { label: 'League', to: toPlayPath('league') }
            ]}
          />
        </div>
      </PageHeroPanel>

      {unlocked ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stageSummary.map((stage) => (
              <Card key={stage.stage} className="rounded-2xl border-border/60 bg-transparent p-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage.stage]}</div>
                  <div className="text-xs text-muted-foreground">Picked {stage.picked}/{stage.total}</div>
                  <div className="text-xs text-muted-foreground">Locked {stage.locked}/{stage.total}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-foreground">Bracket picks and results</div>
              <Table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Match</th>
                    <th>Your pick</th>
                    <th>Actual winner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const pickedWinner = bracket.knockout[entry.stage]?.[entry.match.id]
                    return (
                      <tr key={`${entry.stage}-${entry.match.id}`}>
                        <td>{STAGE_LABELS[entry.stage]}</td>
                        <td>
                          <div className="font-semibold text-foreground">
                            {entry.match.homeTeam.code} vs {entry.match.awayTeam.code}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatTime(entry.match.kickoffUtc)}</div>
                        </td>
                        <td>{winnerLabel(pickedWinner, entry.match)}</td>
                        <td>{winnerLabel(entry.match.winner, entry.match)}</td>
                        <td>{isMatchLocked(entry.match.kickoffUtc, now) ? 'Locked' : 'Open'}</td>
                      </tr>
                    )
                  })}
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-sm text-muted-foreground">
                        No knockout matches available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}
