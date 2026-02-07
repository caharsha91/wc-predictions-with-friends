import { useEffect, useMemo, useState } from 'react'

import { fetchMatches, fetchScoring } from '../../lib/data'
import { getDateKeyInTimeZone } from '../../lib/matches'
import { findPick, getPickOutcome, getPredictedWinner, isPickComplete } from '../../lib/picks'
import type { Match, MatchStage } from '../../types/matches'
import type { Pick, PickOutcome } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { HISTORY_LIST_PAGE_SIZE } from '../constants/pagination'
import { useViewerId } from '../hooks/useViewerId'
import { usePicksData } from '../hooks/usePicksData'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import DetailsDisclosure from '../components/ui/DetailsDisclosure'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'

type StageFilter = 'ALL' | MatchStage
type MatchdayFilter = 'ALL' | string
type ViewTab = 'CURRENT' | 'HISTORY'

type ResultsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: Match[]; lastUpdated: string; scoring: ScoringConfig }

type PickPoints = {
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  total: number
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStageConfig(match: Match, scoring: ScoringConfig) {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function getActualOutcome(match: Match): PickOutcome | undefined {
  if (!match.score) return undefined
  if (match.score.home > match.score.away) return 'WIN'
  if (match.score.home < match.score.away) return 'LOSS'
  return 'DRAW'
}

function scorePick(match: Match, pick: Pick | undefined, scoring: ScoringConfig): PickPoints {
  if (!pick || !match.score || match.status !== 'FINISHED') {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, total: 0 }
  }
  if (!isPickComplete(match, pick)) {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, total: 0 }
  }

  const config = getStageConfig(match, scoring)
  let exactPoints = 0
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    if (pick.homeScore === match.score.home && pick.awayScore === match.score.away) {
      exactPoints = config.exactScoreBoth
    } else if (pick.homeScore === match.score.home || pick.awayScore === match.score.away) {
      exactPoints = config.exactScoreOne
    }
  }

  const predictedOutcome = getPickOutcome(pick)
  const actualOutcome = getActualOutcome(match)
  const resultPoints = predictedOutcome && predictedOutcome === actualOutcome ? config.result : 0

  let knockoutPoints = 0
  if (match.stage !== 'Group' && match.winner && (match.decidedBy === 'ET' || match.decidedBy === 'PENS')) {
    const predictedWinner = getPredictedWinner(pick)
    if (predictedWinner && predictedWinner === match.winner) {
      knockoutPoints = config.knockoutWinner ?? 0
    }
  }

  return {
    exactPoints,
    resultPoints,
    knockoutPoints,
    total: exactPoints + resultPoints + knockoutPoints
  }
}

export default function ResultsPage() {
  const userId = useViewerId()
  const picksState = usePicksData()
  const [activeTab, setActiveTab] = useState<ViewTab>('CURRENT')
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL')
  const [matchdayFilter, setMatchdayFilter] = useState<MatchdayFilter>('ALL')
  const [historyPage, setHistoryPage] = useState(1)
  const [state, setState] = useState<ResultsState>({ status: 'loading' })

  useEffect(() => {
    setHistoryPage(1)
  }, [stageFilter, matchdayFilter])

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [matchesFile, scoring] = await Promise.all([fetchMatches(), fetchScoring()])
        if (canceled) return
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          lastUpdated: matchesFile.lastUpdated,
          scoring
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  const readyLastUpdated = state.status === 'ready' ? state.lastUpdated : undefined
  useEffect(() => {
    if (typeof window === 'undefined' || !readyLastUpdated) return
    const storageKey = `wc-results-seen:${userId}`
    window.sessionStorage.setItem(storageKey, readyLastUpdated)
    window.dispatchEvent(new Event('wc-results-seen-updated'))
  }, [readyLastUpdated, userId])

  if (state.status === 'loading' || picksState.state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load results">
        {state.message}
      </Alert>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load picks">
        {picksState.state.message}
      </Alert>
    )
  }

  const finishedMatches = state.matches
    .filter((match) => match.status === 'FINISHED')
    .sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime())

  const stages = [...new Set(state.matches.map((match) => match.stage))]
  const matchdays = [...new Set(finishedMatches.map((match) => getDateKeyInTimeZone(match.kickoffUtc)))]
  const latestMatchday = matchdays[0] ?? null

  const currentMatches = latestMatchday
    ? finishedMatches.filter((match) => getDateKeyInTimeZone(match.kickoffUtc) === latestMatchday)
    : []

  const historyMatches = finishedMatches
    .filter((match) => (stageFilter === 'ALL' ? true : match.stage === stageFilter))
    .filter((match) =>
      matchdayFilter === 'ALL' ? true : getDateKeyInTimeZone(match.kickoffUtc) === matchdayFilter
    )

  const historyTotalPages = Math.max(1, Math.ceil(historyMatches.length / HISTORY_LIST_PAGE_SIZE))
  const safeHistoryPage = Math.min(historyPage, historyTotalPages)
  const historyStart = (safeHistoryPage - 1) * HISTORY_LIST_PAGE_SIZE
  const pagedHistoryMatches = historyMatches.slice(historyStart, historyStart + HISTORY_LIST_PAGE_SIZE)

  const totalPoints = finishedMatches.reduce((sum, match) => {
    const pick = findPick(picksState.picks, match.id, userId)
    return sum + scorePick(match, pick, state.scoring).total
  }, 0)
  const latestMatchdayPoints = currentMatches.reduce((sum, match) => {
    const pick = findPick(picksState.picks, match.id, userId)
    return sum + scorePick(match, pick, state.scoring).total
  }, 0)

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Results"
        title="Finished Matches"
        subtitle="Scores, your picks, and point breakdown in one workspace."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(state.lastUpdated)}</div>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Latest matchday</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{latestMatchday ?? '—'}</div>
          </Card>
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Latest matchday points</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{latestMatchdayPoints}</div>
          </Card>
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total finished points</div>
            <div className="mt-2 text-lg font-semibold text-foreground">{totalPoints}</div>
          </Card>
        </div>
      </PageHeroPanel>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ViewTab)}>
        <TabsList>
          <TabsTrigger value="CURRENT">Current</TabsTrigger>
          <TabsTrigger value="HISTORY">Past matchdays</TabsTrigger>
        </TabsList>

        <TabsContent value="CURRENT" className="space-y-4">
          <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
              Latest matchday results
            </div>
            <Table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Your pick</th>
                  <th>Result</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {currentMatches.map((match) => {
                  const pick = findPick(picksState.picks, match.id, userId)
                  const points = scorePick(match, pick, state.scoring)
                  return (
                    <tr key={`current-${match.id}`}>
                      <td>
                        <div className="font-semibold text-foreground">
                          {match.homeTeam.code} vs {match.awayTeam.code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {match.stage} · {formatTime(match.kickoffUtc)}
                        </div>
                      </td>
                      <td>
                        {pick
                          ? `${pick.homeScore ?? '-'}-${pick.awayScore ?? '-'}${pick.advances ? ` (${pick.advances})` : ''}`
                          : '—'}
                      </td>
                      <td>{match.score ? `${match.score.home}-${match.score.away}` : '—'}</td>
                      <td>
                        <Badge tone={points.total > 0 ? 'success' : 'secondary'}>+{points.total}</Badge>
                      </td>
                    </tr>
                  )
                })}
                {currentMatches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-sm text-muted-foreground">
                      No finished matches yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="HISTORY" className="space-y-4">
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Matchday filter</div>
                <select
                  value={matchdayFilter}
                  onChange={(event) => setMatchdayFilter(event.target.value as MatchdayFilter)}
                  className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                >
                  <option value="ALL">All past matchdays</option>
                  {matchdays.map((matchday) => (
                    <option key={matchday} value={matchday}>
                      {matchday}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Stage filter</div>
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value as StageFilter)}
                  className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                >
                  <option value="ALL">All stages</option>
                  {stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
            <Table>
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Your pick</th>
                  <th>Result</th>
                  <th>Total</th>
                  <th>Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistoryMatches.map((match) => {
                  const pick = findPick(picksState.picks, match.id, userId)
                  const points = scorePick(match, pick, state.scoring)
                  return (
                    <tr key={match.id}>
                      <td>
                        <div className="font-semibold text-foreground">
                          {match.homeTeam.code} vs {match.awayTeam.code}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getDateKeyInTimeZone(match.kickoffUtc)} · {match.stage}
                        </div>
                      </td>
                      <td>
                        {pick
                          ? `${pick.homeScore ?? '-'}-${pick.awayScore ?? '-'}${pick.advances ? ` (${pick.advances})` : ''}`
                          : '—'}
                      </td>
                      <td>{match.score ? `${match.score.home}-${match.score.away}` : '—'}</td>
                      <td>
                        <Badge tone={points.total > 0 ? 'success' : 'secondary'}>+{points.total}</Badge>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        Exact {points.exactPoints} · Outcome {points.resultPoints} · KO {points.knockoutPoints}
                      </td>
                    </tr>
                  )
                })}
                {pagedHistoryMatches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-muted-foreground">
                      No finished matches for the selected filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>

            {historyMatches.length > HISTORY_LIST_PAGE_SIZE ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Showing {historyStart + 1}-{Math.min(historyStart + HISTORY_LIST_PAGE_SIZE, historyMatches.length)} of{' '}
                  {historyMatches.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={safeHistoryPage <= 1}
                    onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                  >
                    Prev
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Page {safeHistoryPage} / {historyTotalPages}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={safeHistoryPage >= historyTotalPages}
                    onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>

      <DetailsDisclosure title="Scoring info">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Picks lock before kickoff. Knockout ties require selecting who advances.
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Badge tone="secondary">Group exact: {state.scoring.group.exactScoreBoth}</Badge>
            <Badge tone="secondary">Group result: {state.scoring.group.result}</Badge>
            <Badge tone="secondary">Bracket group qualifiers: {state.scoring.bracket.groupQualifiers}</Badge>
            <Badge tone="secondary">Bracket best-thirds: {state.scoring.bracket.thirdPlaceQualifiers}</Badge>
            <Badge tone="secondary">Final winner bonus: {state.scoring.knockout.Final.knockoutWinner ?? 0}</Badge>
          </div>
        </div>
      </DetailsDisclosure>
    </div>
  )
}
