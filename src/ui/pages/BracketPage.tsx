import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'

import { getGroupOutcomesLockTime } from '../../lib/matches'
import { isMatchLocked } from '../../lib/matches'
import type { Match } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { readDemoScenario } from '../lib/demoControls'
import { resolveKnockoutActivation } from '../lib/knockoutActivation'

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

type PredictionResult = 'correct' | 'wrong' | 'pending'

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

function resultTone(status: PredictionResult): 'success' | 'danger' | 'secondary' {
  if (status === 'correct') return 'success'
  if (status === 'wrong') return 'danger'
  return 'secondary'
}

function resultLabel(status: PredictionResult): string {
  if (status === 'correct') return 'Correct'
  if (status === 'wrong') return 'Wrong'
  return 'Pending'
}

function resultSurfaceClass(status: PredictionResult): string {
  if (status === 'correct') return 'bg-[rgba(var(--primary-rgb),0.08)]'
  if (status === 'wrong') return 'bg-[rgba(var(--danger-rgb),0.08)]'
  return ''
}

function actualResultLabel(match: Match): string {
  if (!match.score) return '—'
  const winner = winnerLabel(match.winner, match)
  return `${match.score.home}-${match.score.away}${winner !== '—' ? ` (${winner})` : ''}`
}

function resolvedTeamCode(code?: string): boolean {
  return /^[A-Z]{3}$/.test((code ?? '').trim().toUpperCase())
}

export default function BracketPage() {
  const location = useLocation()
  const isDemoRoute = location.pathname.startsWith('/demo/')
  const demoScenario = isDemoRoute ? readDemoScenario() : null
  const now = useNow({ tickMs: 30_000 })
  const picksState = usePicksData()
  const bracket = useBracketKnockoutData()
  const readyBracketState = bracket.loadState.status === 'ready' ? bracket.loadState : null

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks') =>
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

  const knockoutActivation = useMemo(
    () =>
      resolveKnockoutActivation({
        mode: isDemoRoute ? 'demo' : 'default',
        demoScenario,
        groupComplete: groupClosed,
        drawReady,
        knockoutStarted: false
      }),
    [demoScenario, drawReady, groupClosed, isDemoRoute]
  )
  const unlocked = knockoutActivation.active

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
          <div className="flex items-start gap-3 text-right">
            <ButtonLink to={toPlayPath('picks')} size="sm" variant="primary">
              Back to Picks
            </ButtonLink>
            <div className="text-xs text-muted-foreground" data-last-updated="true">
              <div className="uppercase tracking-[0.2em]">Last updated</div>
              <div className="text-sm font-semibold text-foreground">{formatTime(latestUpdated)}</div>
            </div>
          </div>
        }
      >
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
              <Badge tone="secondary">Source: {knockoutActivation.sourceOfTruthLabel}</Badge>
            </div>

            {knockoutActivation.mismatchWarning ? (
              <Alert tone="warning" title="Knockout activation override">
                {knockoutActivation.mismatchWarning}
              </Alert>
            ) : null}
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
                    const result: PredictionResult =
                      entry.match.status !== 'FINISHED' || !entry.match.winner
                        ? 'pending'
                        : pickedWinner && pickedWinner === entry.match.winner
                          ? 'correct'
                          : 'wrong'
                    return (
                      <tr key={`${entry.stage}-${entry.match.id}`} className={resultSurfaceClass(result)}>
                        <td>{STAGE_LABELS[entry.stage]}</td>
                        <td>
                          <div className="font-semibold text-foreground">
                            {entry.match.homeTeam.code} vs {entry.match.awayTeam.code}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatTime(entry.match.kickoffUtc)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Actual: <span className="font-semibold text-foreground">{actualResultLabel(entry.match)}</span>
                          </div>
                        </td>
                        <td>{winnerLabel(pickedWinner, entry.match)}</td>
                        <td>{winnerLabel(entry.match.winner, entry.match)}</td>
                        <td>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={resultTone(result)}>{resultLabel(result)}</Badge>
                            <Badge tone={isMatchLocked(entry.match.kickoffUtc, now) ? 'locked' : 'secondary'}>
                              {isMatchLocked(entry.match.kickoffUtc, now) ? 'Locked' : 'Open'}
                            </Badge>
                          </div>
                        </td>
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
