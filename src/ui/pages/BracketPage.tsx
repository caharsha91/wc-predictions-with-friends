import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { getGroupOutcomesLockTime, isMatchLocked } from '../../lib/matches'
import { areMatchesCompleted, isMatchCompleted } from '../../lib/matchStatus'
import type { Match } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import {
  LeaderboardCardCurated,
  RightRailSticky,
  type LeaderboardCardRow
} from '../components/group-stage/GroupStageDashboardComponents'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { usePublishedSnapshot } from '../hooks/usePublishedSnapshot'
import { useToast } from '../hooks/useToast'
import { useViewerId } from '../hooks/useViewerId'
import { readDemoScenario } from '../lib/demoControls'
import { resolveKnockoutActivation } from '../lib/knockoutActivation'
import { buildLeaderboardPresentation } from '../lib/leaderboardPresentation'
import { rankRowsWithTiePriority } from '../lib/leaderboardTieRanking'
import { readUserProfile } from '../lib/profilePersistence'
import { formatSnapshotTimestamp } from '../lib/snapshotStamp'

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

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeKey(viewerId)
  const seen = new Set<string>()
  const next: string[] = []

  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    if (!trimmed) continue
    const key = normalizeKey(trimmed)
    if (!key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
    if (next.length >= 3) break
  }

  return next
}

export default function BracketPage() {
  // QA-SMOKE: route=/play/bracket and /demo/play/bracket ; checklist-id=smoke-knockout-detail
  const location = useLocation()
  const isDemoRoute = location.pathname.startsWith('/demo/')
  const dataMode = isDemoRoute ? 'demo' : 'default'
  const demoScenario = isDemoRoute ? readDemoScenario() : null
  const now = useNow({ tickMs: 30_000 })
  const viewerId = useViewerId()
  const isDesktopRailViewport = useMediaQuery('(min-width: 1024px)')
  const isMobile = useMediaQuery('(max-width: 1023px)')
  const { showToast } = useToast()
  const picksState = usePicksData()
  const bracket = useBracketKnockoutData()
  const publishedSnapshot = usePublishedSnapshot()
  const [leaguePeekOpen, setLeaguePeekOpen] = useState(false)
  const [rivalUserIds, setRivalUserIds] = useState<string[]>([])
  const readyBracketState = bracket.loadState.status === 'ready' ? bracket.loadState : null

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const leaderboardPath = `${playRoot}/league`
  const toPlayPath = (segment?: 'picks') =>
    segment ? `${playRoot}/${segment}` : playRoot

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupClosed = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false

  const knockoutMatchesFromFixtures = useMemo(
    () => matches.filter((match) => match.stage !== 'Group'),
    [matches]
  )
  const isKnockoutFinal = useMemo(
    () => areMatchesCompleted(matches, (match) => match.stage !== 'Group'),
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

  const [viewMode, setViewMode] = useState<'table' | 'list'>('table')
  useEffect(() => {
    setViewMode(isMobile ? 'list' : 'table')
  }, [isMobile])

  useEffect(() => {
    let canceled = false

    async function loadRivals() {
      try {
        const profile = await readUserProfile(dataMode, viewerId)
        if (canceled) return
        setRivalUserIds(sanitizeRivalUserIds(profile.rivalUserIds, viewerId))
      } catch {
        if (!canceled) setRivalUserIds([])
      }
    }

    void loadRivals()
    return () => {
      canceled = true
    }
  }, [dataMode, viewerId])

  const snapshotReady = publishedSnapshot.state.status === 'ready' ? publishedSnapshot.state : null
  const leaderboardSnapshotLabel = formatSnapshotTimestamp(snapshotReady?.snapshotTimestamp)
  const leaderboardCardTitle = isKnockoutFinal ? 'Final Leaderboard' : 'Projected Leaderboard'
  const leaderboardRowsForCard = useMemo<LeaderboardCardRow[]>(() => {
    if (!snapshotReady) return []
    const sectionRows = buildLeaderboardPresentation({
      snapshotTimestamp: snapshotReady.snapshotTimestamp,
      groupStageComplete: snapshotReady.groupStageComplete,
      projectedGroupStagePointsByUser: snapshotReady.projectedGroupStagePointsByUser,
      leaderboardRows: snapshotReady.leaderboardRows
    }).rows.map((entry) => ({
      id: entry.member.id || entry.member.name,
      name: entry.member.name,
      points: entry.bracketPoints,
      isYou: normalizeKey(entry.member.id) === normalizeKey(viewerId)
    }))

    const ranked = rankRowsWithTiePriority({
      rows: sectionRows,
      getPoints: (row) => row.points,
      getIdentityKeys: (row) => [row.id],
      getName: (row) => row.name,
      viewerIdentity: viewerId,
      rivalIdentities: rivalUserIds
    })

    return ranked.rankedRows.map(({ row, rank }) => ({
      id: row.id,
      name: row.name,
      rank,
      points: row.points,
      isYou: row.isYou
    }))
  }, [rivalUserIds, snapshotReady, viewerId])

  useEffect(() => {
    if (!isDesktopRailViewport) return
    setLeaguePeekOpen(false)
  }, [isDesktopRailViewport])

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
      <div className="grid gap-3 lg:grid-cols-[minmax(0,7fr)_minmax(320px,3fr)]">
        <div className="space-y-6">
          <PageHeroPanel
          kicker="Knockout"
          title="Knockout Detail"
          subtitle="Read-only bracket picks and results. Use Play Center for guided edits."
          meta={
            <div className="flex items-start gap-3 text-right">
              <ButtonLink to={toPlayPath()} size="sm" variant="primary">
                Back to Play Center
              </ButtonLink>
              <div className="text-xs text-muted-foreground" data-last-updated="true">
                <div className="uppercase tracking-[0.2em]">Last updated</div>
                <div className="text-sm font-semibold text-foreground">{formatSnapshotTimestamp(latestUpdated)}</div>
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">Bracket picks and results</div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={viewMode === 'list' ? 'primary' : 'secondary'}
                        onClick={() => setViewMode('list')}
                      >
                        List view
                      </Button>
                      <Button
                        size="sm"
                        variant={viewMode === 'table' ? 'primary' : 'secondary'}
                        onClick={() => setViewMode('table')}
                      >
                        Table view
                      </Button>
                    </div>
                  </div>
                  {viewMode === 'table' ? (
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
                          !isMatchCompleted(entry.match) || !entry.match.winner
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
                              {!isMatchLocked(entry.match.kickoffUtc, now) ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={pickedWinner === 'HOME' ? 'border-primary' : undefined}
                                    onClick={async () => {
                                      bracket.setPick(entry.stage, entry.match.id, 'HOME')
                                      const ok = await bracket.save()
                                      showToast({
                                        tone: ok ? 'success' : 'danger',
                                        title: ok ? 'Knockout pick saved' : 'Autosave failed',
                                        message: ok
                                          ? `${entry.match.homeTeam.code} set to advance.`
                                          : 'Unable to save knockout pick.'
                                      })
                                    }}
                                  >
                                    {entry.match.homeTeam.code} advances
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={pickedWinner === 'AWAY' ? 'border-primary' : undefined}
                                    onClick={async () => {
                                      bracket.setPick(entry.stage, entry.match.id, 'AWAY')
                                      const ok = await bracket.save()
                                      showToast({
                                        tone: ok ? 'success' : 'danger',
                                        title: ok ? 'Knockout pick saved' : 'Autosave failed',
                                        message: ok
                                          ? `${entry.match.awayTeam.code} set to advance.`
                                          : 'Unable to save knockout pick.'
                                      })
                                    }}
                                  >
                                    {entry.match.awayTeam.code} advances
                                  </Button>
                                </div>
                              ) : null}
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
                  ) : (
                    <div className="space-y-3">
                      {entries.map((entry) => {
                        const pickedWinner = bracket.knockout[entry.stage]?.[entry.match.id]
                        const result: PredictionResult =
                          !isMatchCompleted(entry.match) || !entry.match.winner
                            ? 'pending'
                            : pickedWinner && pickedWinner === entry.match.winner
                              ? 'correct'
                              : 'wrong'
                        return (
                          <div
                            key={`${entry.stage}-${entry.match.id}`}
                            className={`rounded-xl border border-border/70 p-3 ${resultSurfaceClass(result)}`}
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <Badge tone="secondary">{STAGE_LABELS[entry.stage]}</Badge>
                                <div className="flex items-center gap-2">
                                  <Badge tone={resultTone(result)}>{resultLabel(result)}</Badge>
                                  <Badge tone={isMatchLocked(entry.match.kickoffUtc, now) ? 'locked' : 'secondary'}>
                                    {isMatchLocked(entry.match.kickoffUtc, now) ? 'Locked' : 'Open'}
                                  </Badge>
                                </div>
                              </div>
                              <div>
                                <div className="font-semibold text-foreground">
                                  {entry.match.homeTeam.code} vs {entry.match.awayTeam.code}
                                </div>
                                <div className="text-xs text-muted-foreground">{formatTime(entry.match.kickoffUtc)}</div>
                              </div>
                              {!isMatchLocked(entry.match.kickoffUtc, now) ? (
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={pickedWinner === 'HOME' ? 'border-primary' : undefined}
                                    onClick={async () => {
                                      bracket.setPick(entry.stage, entry.match.id, 'HOME')
                                      const ok = await bracket.save()
                                      showToast({
                                        tone: ok ? 'success' : 'danger',
                                        title: ok ? 'Knockout pick saved' : 'Autosave failed',
                                        message: ok
                                          ? `${entry.match.homeTeam.code} set to advance.`
                                          : 'Unable to save knockout pick.'
                                      })
                                    }}
                                  >
                                    {entry.match.homeTeam.code} advances
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className={pickedWinner === 'AWAY' ? 'border-primary' : undefined}
                                    onClick={async () => {
                                      bracket.setPick(entry.stage, entry.match.id, 'AWAY')
                                      const ok = await bracket.save()
                                      showToast({
                                        tone: ok ? 'success' : 'danger',
                                        title: ok ? 'Knockout pick saved' : 'Autosave failed',
                                        message: ok
                                          ? `${entry.match.awayTeam.code} set to advance.`
                                          : 'Unable to save knockout pick.'
                                      })
                                    }}
                                  >
                                    {entry.match.awayTeam.code} advances
                                  </Button>
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                Your pick: <span className="font-semibold text-foreground">{winnerLabel(pickedWinner, entry.match)}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Actual: <span className="font-semibold text-foreground">{actualResultLabel(entry.match)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {entries.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                          No knockout matches available.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>
            </>
          ) : null}
        </div>

        {isDesktopRailViewport ? (
          <RightRailSticky>
            <LeaderboardCardCurated
              rows={leaderboardRowsForCard}
              snapshotLabel={leaderboardSnapshotLabel}
              topCount={3}
              title={leaderboardCardTitle}
              leaderboardPath={leaderboardPath}
              priorityUserIds={rivalUserIds}
            />
          </RightRailSticky>
        ) : null}
      </div>

      {!isDesktopRailViewport ? (
        <>
          <Button
            size="sm"
            variant="secondary"
            className="league-peek-fab fixed bottom-[calc(var(--bottom-nav-height)+0.75rem)] right-4 z-40 h-10 rounded-full px-4 text-[12px] lg:hidden"
            onClick={() => setLeaguePeekOpen(true)}
          >
            League Peek
          </Button>
          <Sheet open={leaguePeekOpen} onOpenChange={setLeaguePeekOpen}>
            <SheetContent side="bottom" className="league-peek-sheet-content max-h-[80dvh] rounded-t-2xl p-0">
              <SheetHeader>
                <SheetTitle>League Peek</SheetTitle>
                <SheetDescription>Snapshot leaderboard summary.</SheetDescription>
              </SheetHeader>
              <div className="p-3">
                <LeaderboardCardCurated
                  rows={leaderboardRowsForCard}
                  snapshotLabel={leaderboardSnapshotLabel}
                  topCount={3}
                  title={leaderboardCardTitle}
                  leaderboardPath={leaderboardPath}
                  priorityUserIds={rivalUserIds}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  )
}
