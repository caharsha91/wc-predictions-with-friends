import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, getPickOutcome, getPredictedWinner, isPickComplete } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { CORE_LIST_PAGE_SIZE } from '../constants/pagination'
import PicksWizardFlow from '../components/play/PicksWizardFlow'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'

const EMPTY_MATCHES: Match[] = []
const FINISHED_LIST_PAGE_SIZE = 10

type ScoringState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; scoring: ScoringConfig }

type PickPoints = {
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  total: number
}

type PredictionResult = 'correct' | 'wrong' | 'pending'

function formatKickoff(utcIso: string): string {
  return new Date(utcIso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatChipDateTime(utcIso?: string): string {
  return utcIso ? formatKickoff(utcIso) : '—'
}

function buildPageNumbers(totalPages: number): number[] {
  return Array.from({ length: totalPages }, (_, index) => index + 1)
}

function getStageConfig(match: Match, scoring: ScoringConfig) {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function getActualOutcome(match: Match): 'WIN' | 'LOSS' | 'DRAW' | undefined {
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

function resultRowClass(status: PredictionResult): string {
  if (status === 'correct') return 'bg-[rgba(var(--primary-rgb),0.08)]'
  if (status === 'wrong') return 'bg-[rgba(var(--danger-rgb),0.08)]'
  return 'bg-bg2/40'
}

function pickLabel(match: Match, pick: Pick | undefined): string {
  if (!pick) return '—'
  return `${pick.homeScore ?? '-'}-${pick.awayScore ?? '-'}${pick.advances ? ` (${pick.advances})` : ''}`
}

function actualLabel(match: Match): string {
  if (!match.score) return '—'
  const winnerCode =
    match.winner === 'HOME'
      ? match.homeTeam.code
      : match.winner === 'AWAY'
        ? match.awayTeam.code
        : undefined
  const winnerSuffix = winnerCode ? ` (${winnerCode})` : ''
  return `${match.score.home}-${match.score.away}${winnerSuffix}`
}

function getPredictionResult(match: Match, pick: Pick | undefined): PredictionResult {
  if (match.status !== 'FINISHED' || !match.score) return 'pending'
  if (!pick || !isPickComplete(match, pick)) return 'wrong'
  if (match.stage === 'Group') {
    const predicted = getPickOutcome(pick)
    const actual = getActualOutcome(match)
    if (!predicted || !actual) return 'wrong'
    return predicted === actual ? 'correct' : 'wrong'
  }
  if (!match.winner) return 'pending'
  const predictedWinner = getPredictedWinner(pick)
  if (!predictedWinner) return 'wrong'
  return predictedWinner === match.winner ? 'correct' : 'wrong'
}

function ReadOnlyMatchList({
  matches,
  picks,
  userId,
  now,
  emptyMessage,
  pageSize = CORE_LIST_PAGE_SIZE,
  showInlineEdit = false,
  onEditMatch
}: {
  matches: Match[]
  picks: Pick[]
  userId: string
  now: Date
  emptyMessage: string
  pageSize?: number
  showInlineEdit?: boolean
  onEditMatch?: (matchId: string) => void
}) {
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [matches.length])

  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const visibleMatches = matches.slice(startIndex, startIndex + pageSize)

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {visibleMatches.map((match) => {
          const pick = findPick(picks, match.id, userId)
          const complete = isPickComplete(match, pick)
          const locked = isMatchLocked(match.kickoffUtc, now)
          const result = getPredictionResult(match, pick)
          return (
            <div key={match.id} className={`rounded-xl border border-border/70 p-3 ${resultRowClass(result)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {match.homeTeam.code} vs {match.awayTeam.code}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {match.stage} · {formatKickoff(match.kickoffUtc)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Your pick: <span className="font-semibold text-foreground">{pickLabel(match, pick)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Actual: <span className="font-semibold text-foreground">{actualLabel(match)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={complete ? 'success' : locked ? 'locked' : 'warning'}>
                    {complete ? 'Picked' : locked ? 'Locked' : 'Needs pick'}
                  </Badge>
                  <Badge tone={resultTone(result)}>{resultLabel(result)}</Badge>
                  {showInlineEdit && !locked ? (
                    <Button size="sm" variant="secondary" onClick={() => onEditMatch?.(match.id)}>
                      Edit
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + pageSize, matches.length)} of {matches.length}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {buildPageNumbers(totalPages).map((pageNumber) => (
              <Button
                key={`readonly-page-${pageNumber}`}
                type="button"
                size="sm"
                variant={pageNumber === safePage ? 'primary' : 'secondary'}
                onClick={() => setPage(pageNumber)}
                aria-label={`Open page ${pageNumber}`}
                disabled={pageNumber === safePage}
              >
                {pageNumber}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function PicksPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const now = useNow()
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const picksState = usePicksData()
  const [scoringState, setScoringState] = useState<ScoringState>({ status: 'loading' })
  const [finishedPage, setFinishedPage] = useState(1)
  const [expandedSections, setExpandedSections] = useState<string[]>(['open-now'])
  const [quickEditMatchId, setQuickEditMatchId] = useState<string | null>(null)

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks') =>
    segment ? `${playRoot}/${segment}` : playRoot

  useEffect(() => {
    let canceled = false
    async function loadScoring() {
      try {
        const scoring = await fetchScoring({ mode })
        if (!canceled) setScoringState({ status: 'ready', scoring })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setScoringState({ status: 'error', message })
      }
    }
    void loadScoring()
    return () => {
      canceled = true
    }
  }, [mode])

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : EMPTY_MATCHES

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status !== 'FINISHED')
        .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()),
    [matches]
  )

  const openMatches = useMemo(
    () => upcomingMatches.filter((match) => !isMatchLocked(match.kickoffUtc, now)),
    [now, upcomingMatches]
  )

  const pendingOpenMatches = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return !isPickComplete(match, pick)
      }),
    [openMatches, picksState.picks, userId]
  )

  const completedOpenMatches = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return isPickComplete(match, pick)
      }),
    [openMatches, picksState.picks, userId]
  )

  const lockedMatches = useMemo(
    () => upcomingMatches.filter((match) => isMatchLocked(match.kickoffUtc, now)),
    [now, upcomingMatches]
  )

  const pendingOpenDeadlines = useMemo(
    () => pendingOpenMatches.map((match) => getLockTime(match.kickoffUtc).toISOString()),
    [pendingOpenMatches]
  )
  const nextOpenDeadlineUtc = [...pendingOpenDeadlines].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const nextLockedKickoffUtc = lockedMatches
    .map((match) => match.kickoffUtc)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]

  const finishedMatches = useMemo(
    () =>
      matches
        .filter((match) => match.status === 'FINISHED')
        .sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime()),
    [matches]
  )
  const finishedTotalPages = Math.max(1, Math.ceil(finishedMatches.length / FINISHED_LIST_PAGE_SIZE))
  const safeFinishedPage = Math.min(finishedPage, finishedTotalPages)
  const finishedStartIndex = (safeFinishedPage - 1) * FINISHED_LIST_PAGE_SIZE
  const visibleFinishedMatches = finishedMatches.slice(
    finishedStartIndex,
    finishedStartIndex + FINISHED_LIST_PAGE_SIZE
  )

  const latestResultsUpdatedUtc =
    finishedMatches.length > 0 && picksState.state.status === 'ready'
      ? picksState.state.lastUpdated
      : undefined

  useEffect(() => {
    setFinishedPage(1)
  }, [finishedMatches.length])

  const latestCompletedOpenSubmissionUtc = completedOpenMatches
    .map((match) => findPick(picksState.picks, match.id, userId)?.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!expandedSections.includes('finished')) return
    if (!latestResultsUpdatedUtc) return
    const storageKey = `wc-results-seen:${userId}`
    window.sessionStorage.setItem(storageKey, latestResultsUpdatedUtc)
    window.dispatchEvent(new Event('wc-results-seen-updated'))
  }, [expandedSections, latestResultsUpdatedUtc, userId])

  if (picksState.state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load picks">
        {picksState.state.message}
      </Alert>
    )
  }

  const quickEditMatch = quickEditMatchId ? matches.find((match) => match.id === quickEditMatchId) ?? null : null

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <PageHeroPanel
        title="Picks Detail"
        subtitle="Read-only pick detail with embedded results. Use Play Center for guided edits."
        kicker="Reference"
        meta={
          <div className="flex items-start gap-3 text-right">
            <ButtonLink to={toPlayPath('picks')} size="sm" variant="primary">
              Back to Picks
            </ButtonLink>
            <div className="text-xs text-muted-foreground" data-last-updated="true">
              <div className="uppercase tracking-[0.2em]">Last updated</div>
              <div className="text-sm font-semibold text-foreground">
                {formatKickoff(picksState.state.lastUpdated)}
              </div>
            </div>
          </div>
        }
        />

        <Accordion
          type="multiple"
          className="space-y-3"
          value={expandedSections}
          onValueChange={setExpandedSections}
        >
        <AccordionItem value="open-now">
          <AccordionTrigger>
            <span className="flex flex-wrap items-center gap-2">
              Open now
              <Badge tone={pendingOpenMatches.length > 0 ? 'warning' : 'secondary'}>
                {pendingOpenMatches.length}
              </Badge>
              <Badge tone="warning">Deadline {formatChipDateTime(nextOpenDeadlineUtc)}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="mb-3 text-xs text-muted-foreground">Unsubmitted and unlocked picks.</div>
            <ReadOnlyMatchList
              matches={pendingOpenMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No urgent picks right now."
              showInlineEdit
              onEditMatch={setQuickEditMatchId}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="completed">
          <AccordionTrigger>
            <span className="flex flex-wrap items-center gap-2">
              Completed (open)
              <Badge tone="success">{completedOpenMatches.length}</Badge>
              <Badge tone="secondary">Last submitted {formatChipDateTime(latestCompletedOpenSubmissionUtc)}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReadOnlyMatchList
              matches={completedOpenMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No completed open picks yet."
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="locked">
          <AccordionTrigger>
            <span className="flex flex-wrap items-center gap-2">
              Locked / waiting
              <Badge tone="locked">{lockedMatches.length}</Badge>
              <Badge tone="locked">Next kickoff {formatChipDateTime(nextLockedKickoffUtc)}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReadOnlyMatchList
              matches={lockedMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No locked picks."
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="finished">
          <AccordionTrigger>
            <span className="flex flex-wrap items-center gap-2">
              Finished matches
              <Badge tone="secondary">{finishedMatches.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              {scoringState.status === 'error' ? (
                <Alert tone="warning" title="Points unavailable">
                  Scoring config could not be loaded. Finished matches are shown without points.
                </Alert>
              ) : null}

              <Table>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Your pick</th>
                    <th>Result</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFinishedMatches.map((match) => {
                    const pick = findPick(picksState.picks, match.id, userId)
                    const result = getPredictionResult(match, pick)
                    const points =
                      scoringState.status === 'ready'
                        ? scorePick(match, pick, scoringState.scoring)
                        : undefined
                    return (
                      <tr key={`finished-${match.id}`} className={resultRowClass(result)}>
                        <td>
                          <div className="font-semibold text-foreground">
                            {match.homeTeam.code} vs {match.awayTeam.code}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {match.stage} · {formatKickoff(match.kickoffUtc)}
                          </div>
                        </td>
                        <td>{pickLabel(match, pick)}</td>
                        <td>{actualLabel(match)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Badge tone={resultTone(result)}>{resultLabel(result)}</Badge>
                          {points ? (
                            <Badge tone={points.total > 0 ? 'success' : 'secondary'}>+{points.total}</Badge>
                          ) : (
                            '—'
                          )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {visibleFinishedMatches.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-sm text-muted-foreground">
                        No finished matches yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>

              {finishedMatches.length > FINISHED_LIST_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Showing {finishedStartIndex + 1}-{Math.min(finishedStartIndex + FINISHED_LIST_PAGE_SIZE, finishedMatches.length)} of{' '}
                    {finishedMatches.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {buildPageNumbers(finishedTotalPages).map((pageNumber) => (
                      <Button
                        key={`finished-page-${pageNumber}`}
                        type="button"
                        size="sm"
                        variant={pageNumber === safeFinishedPage ? 'primary' : 'secondary'}
                        onClick={() => setFinishedPage(pageNumber)}
                        aria-label={`Finished page ${pageNumber}`}
                        disabled={pageNumber === safeFinishedPage}
                      >
                        {pageNumber}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
        </Accordion>
      </div>

      <Sheet open={Boolean(quickEditMatchId)} onOpenChange={(open) => !open && setQuickEditMatchId(null)}>
        <SheetContent side="right" className="w-[96vw] max-w-xl p-0">
          <SheetHeader>
            <SheetTitle>Quick edit</SheetTitle>
            <SheetDescription>
              {quickEditMatch
                ? `${quickEditMatch.homeTeam.code} vs ${quickEditMatch.awayTeam.code}`
                : 'Edit match pick'}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4">
            <PicksWizardFlow
              layout="compact-inline"
              onOpenReferencePage={() => navigate(toPlayPath('picks'))}
              activeMatchId={quickEditMatchId}
            />
          </div>
          <div className="border-t border-border/60 p-4">
            <SheetClose asChild>
              <Button variant="secondary">Close</Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
