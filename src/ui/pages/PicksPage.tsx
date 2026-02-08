import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, getPickOutcome, getPredictedWinner, isPickComplete } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { CORE_LIST_PAGE_SIZE } from '../constants/pagination'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import DetailQuickMenu from '../components/ui/DetailQuickMenu'
import PageHeroPanel from '../components/ui/PageHeroPanel'
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

function formatCountdown(target: Date, now: Date) {
  const diffMs = Math.max(0, target.getTime() - now.getTime())
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  }
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
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

function ReadOnlyMatchList({
  matches,
  picks,
  userId,
  now,
  emptyMessage,
  pageSize = CORE_LIST_PAGE_SIZE
}: {
  matches: Match[]
  picks: Pick[]
  userId: string
  now: Date
  emptyMessage: string
  pageSize?: number
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
          return (
            <div key={match.id} className="rounded-xl border border-border/70 bg-bg2/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {match.homeTeam.code} vs {match.awayTeam.code}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {match.stage} · {formatKickoff(match.kickoffUtc)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={complete ? 'success' : locked ? 'locked' : 'warning'}>
                    {complete ? 'Picked' : locked ? 'Locked' : 'Needs pick'}
                  </Badge>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + pageSize, matches.length)} of {matches.length}
          </div>
          <div className="text-xs text-muted-foreground">
            Page {safePage} / {totalPages}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function PicksPage() {
  const location = useLocation()
  const now = useNow()
  const lockNow = useNow({ tickMs: 1000 })
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const picksState = usePicksData()
  const [scoringState, setScoringState] = useState<ScoringState>({ status: 'loading' })
  const [finishedPage, setFinishedPage] = useState(1)
  const [expandedSections, setExpandedSections] = useState<string[]>(['open-now'])

  const playRoot = location.pathname.startsWith('/demo/') ? '/demo/play' : '/play'
  const toPlayPath = (segment?: 'picks' | 'group-stage' | 'bracket' | 'league') =>
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

  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])

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

  const nextLock = useMemo(() => {
    const candidates = matches
      .filter((match) => match.status !== 'FINISHED')
      .map((match) => ({ match, lockTime: getLockTime(match.kickoffUtc) }))
      .filter((entry) => entry.lockTime.getTime() > lockNow.getTime())
      .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())
    return candidates[0] ?? null
  }, [lockNow, matches])

  const nextLockCountdown = nextLock ? formatCountdown(nextLock.lockTime, lockNow) : null
  const nextLockPick = nextLock ? findPick(picksState.picks, nextLock.match.id, userId) : undefined
  const nextLockPicked = nextLock ? isPickComplete(nextLock.match, nextLockPick) : false

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

  return (
    <div className="space-y-6">
      <PageHeroPanel
        title="Picks Detail"
        subtitle="Read-only pick detail with embedded results. Use Play Center for guided edits."
        kicker="Reference"
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">
              {formatKickoff(picksState.state.lastUpdated)}
            </div>
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-2xl border-border/70 bg-transparent p-4 sm:p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Next lock</div>
                {nextLock ? (
                  <Badge tone="warning">Deadline {formatKickoff(nextLock.lockTime.toISOString())}</Badge>
                ) : null}
              </div>
              {nextLock ? (
                <>
                  <div className="text-xl font-semibold text-foreground">
                    {nextLock.match.homeTeam.code} vs {nextLock.match.awayTeam.code}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {nextLock.match.stage} · Locks at {formatKickoff(nextLock.lockTime.toISOString())}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-bg2/40 p-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-muted-foreground">Locks in</div>
                      <div className="text-sm font-semibold text-foreground">{nextLockCountdown}</div>
                    </div>
                    <Badge tone={nextLockPicked ? 'success' : 'warning'}>
                      {nextLockPicked ? 'Picked' : 'Needs pick'}
                    </Badge>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  No upcoming lock windows.
                </div>
              )}
            </div>
          </Card>

          <DetailQuickMenu
            stats={[
              { label: 'To pick', value: pendingOpenMatches.length },
              { label: 'Open picked', value: completedOpenMatches.length },
              { label: 'Locked', value: lockedMatches.length },
              { label: 'Finished', value: finishedMatches.length }
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
                    const points =
                      scoringState.status === 'ready'
                        ? scorePick(match, pick, scoringState.scoring)
                        : undefined
                    return (
                      <tr key={`finished-${match.id}`}>
                        <td>
                          <div className="font-semibold text-foreground">
                            {match.homeTeam.code} vs {match.awayTeam.code}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {match.stage} · {formatKickoff(match.kickoffUtc)}
                          </div>
                        </td>
                        <td>
                          {pick
                            ? `${pick.homeScore ?? '-'}-${pick.awayScore ?? '-'}${pick.advances ? ` (${pick.advances})` : ''}`
                            : '—'}
                        </td>
                        <td>{match.score ? `${match.score.home}-${match.score.away}` : '—'}</td>
                        <td>
                          {points ? (
                            <Badge tone={points.total > 0 ? 'success' : 'secondary'}>+{points.total}</Badge>
                          ) : (
                            '—'
                          )}
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
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Showing {finishedStartIndex + 1}-{Math.min(finishedStartIndex + FINISHED_LIST_PAGE_SIZE, finishedMatches.length)} of{' '}
                    {finishedMatches.length}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Page {safeFinishedPage} / {finishedTotalPages}
                  </div>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card className="rounded-2xl border-border/70 bg-transparent p-4">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="font-semibold text-foreground">Read-only detail page</div>
          <div>Use Play Center for guided pick edits and phase-specific wizards.</div>
          <div>
            {groupLockTime
              ? `Group outcomes lock at ${formatKickoff(groupLockTime.toISOString())}.`
              : 'Group outcomes unlock with group matches.'}
          </div>
        </div>
      </Card>
    </div>
  )
}
