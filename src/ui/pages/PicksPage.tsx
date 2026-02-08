import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, getPickOutcome, getPredictedWinner, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickAdvances, PickOutcome } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { CORE_LIST_PAGE_SIZE } from '../constants/pagination'
import { Alert } from '../components/ui/Alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { cn } from '../lib/utils'

type DraftPick = {
  homeScore: string
  awayScore: string
  advances: '' | PickAdvances
}

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

function parseScore(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.floor(parsed))
}

function toDraft(pick?: Pick): DraftPick {
  return {
    homeScore: typeof pick?.homeScore === 'number' ? String(pick.homeScore) : '',
    awayScore: typeof pick?.awayScore === 'number' ? String(pick.awayScore) : '',
    advances: pick?.advances ?? ''
  }
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

function MatchList({
  matches,
  picks,
  userId,
  now,
  emptyMessage,
  onOpenEditor,
  actionLabel,
  pageSize = CORE_LIST_PAGE_SIZE
}: {
  matches: Match[]
  picks: Pick[]
  userId: string
  now: Date
  emptyMessage: string
  onOpenEditor: (matchId: string) => void
  actionLabel: string
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
          const matchday = getDateKeyInTimeZone(match.kickoffUtc)
          return (
            <div key={match.id} className="rounded-xl border border-border/70 bg-bg2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {match.homeTeam.code} vs {match.awayTeam.code}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Matchday {matchday} · {match.stage} · {formatKickoff(match.kickoffUtc)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={complete ? 'success' : locked ? 'locked' : 'warning'}>
                    {complete ? 'Picked' : locked ? 'Locked' : 'Needs pick'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={locked}
                    onClick={() => onOpenEditor(match.id)}
                  >
                    {actionLabel}
                  </Button>
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Prev
            </Button>
            <div className="text-xs text-muted-foreground">
              Page {safePage} / {totalPages}
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={safePage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PickEditor({
  selectedMatch,
  draft,
  onDraftChange,
  onSave,
  locked,
  canSave,
  saving,
  saveStatus
}: {
  selectedMatch: Match | null
  draft: DraftPick
  onDraftChange: (next: DraftPick) => void
  onSave: () => void
  locked: boolean
  canSave: boolean
  saving: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}) {
  if (!selectedMatch) {
    return (
      <Card className="rounded-2xl border-border/60 p-4">
        <div className="text-sm text-muted-foreground">Choose an open match to quick-edit a pick.</div>
      </Card>
    )
  }

  const parsedHome = parseScore(draft.homeScore)
  const parsedAway = parseScore(draft.awayScore)
  const tieInput = parsedHome !== undefined && parsedAway !== undefined && parsedHome === parsedAway
  const requiresAdvances = selectedMatch.stage !== 'Group' && tieInput

  return (
    <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quick editor</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {selectedMatch.homeTeam.code} vs {selectedMatch.awayTeam.code}
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedMatch.stage} · Kickoff {formatKickoff(selectedMatch.kickoffUtc)} · Locks{' '}
            {formatKickoff(getLockTime(selectedMatch.kickoffUtc).toISOString())}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {selectedMatch.homeTeam.code} score
            </div>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={draft.homeScore}
              onChange={(event) => onDraftChange({ ...draft, homeScore: event.target.value })}
              disabled={locked}
            />
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {selectedMatch.awayTeam.code} score
            </div>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={draft.awayScore}
              onChange={(event) => onDraftChange({ ...draft, awayScore: event.target.value })}
              disabled={locked}
            />
          </div>
        </div>

        {selectedMatch.stage !== 'Group' ? (
          <div className="rounded-xl border border-border/70 bg-bg2 p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Knockout tie rule</div>
            <div className="mt-1 text-sm text-foreground">
              Tied knockout scores require selecting who advances.
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                data-active={draft.advances === 'HOME' ? 'true' : 'false'}
                className={draft.advances === 'HOME' ? 'border-primary' : ''}
                disabled={locked || !requiresAdvances}
                onClick={() => onDraftChange({ ...draft, advances: 'HOME' })}
              >
                {selectedMatch.homeTeam.code} advances
              </Button>
              <Button
                variant="secondary"
                data-active={draft.advances === 'AWAY' ? 'true' : 'false'}
                className={draft.advances === 'AWAY' ? 'border-primary' : ''}
                disabled={locked || !requiresAdvances}
                onClick={() => onDraftChange({ ...draft, advances: 'AWAY' })}
              >
                {selectedMatch.awayTeam.code} advances
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={locked ? 'locked' : 'info'}>{locked ? 'Locked' : 'Open'}</Badge>
          {saveStatus === 'saved' ? <Badge tone="success">Saved</Badge> : null}
          {saveStatus === 'error' ? <Badge tone="danger">Save failed</Badge> : null}
        </div>

        <Button onClick={onSave} disabled={!canSave} loading={saving}>
          Save quick edit
        </Button>
      </div>
    </Card>
  )
}

export default function PicksPage() {
  const navigate = useNavigate()
  const now = useNow()
  const lockNow = useNow({ tickMs: 1000 })
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const picksState = usePicksData()
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPick>({ homeScore: '', awayScore: '', advances: '' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [savingPick, setSavingPick] = useState(false)
  const [scoringState, setScoringState] = useState<ScoringState>({ status: 'loading' })
  const [finishedPage, setFinishedPage] = useState(1)
  const [expandedSections, setExpandedSections] = useState<string[]>(['open-now'])

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

  const quickEditTarget = pendingOpenMatches[0] ?? openMatches[0] ?? null

  useEffect(() => {
    if (upcomingMatches.length === 0) {
      setSelectedMatchId(null)
      return
    }
    const stillVisible = selectedMatchId && upcomingMatches.some((match) => match.id === selectedMatchId)
    if (stillVisible) return
    setSelectedMatchId(quickEditTarget?.id ?? upcomingMatches[0]?.id ?? null)
  }, [quickEditTarget?.id, selectedMatchId, upcomingMatches])

  const selectedMatch = useMemo(
    () => upcomingMatches.find((match) => match.id === selectedMatchId) ?? null,
    [selectedMatchId, upcomingMatches]
  )

  const selectedPick = useMemo(
    () => (selectedMatch ? findPick(picksState.picks, selectedMatch.id, userId) : undefined),
    [picksState.picks, selectedMatch, userId]
  )

  useEffect(() => {
    setDraft(toDraft(selectedPick))
  }, [selectedPick?.id, selectedPick?.updatedAt, selectedMatch?.id])

  const parsedHome = parseScore(draft.homeScore)
  const parsedAway = parseScore(draft.awayScore)
  const tieInput = parsedHome !== undefined && parsedAway !== undefined && parsedHome === parsedAway
  const requiresAdvances = selectedMatch ? selectedMatch.stage !== 'Group' && tieInput : false
  const selectedLocked = selectedMatch ? isMatchLocked(selectedMatch.kickoffUtc, now) : true
  const canSavePick =
    !!selectedMatch &&
    !selectedLocked &&
    parsedHome !== undefined &&
    parsedAway !== undefined &&
    (!requiresAdvances || draft.advances === 'HOME' || draft.advances === 'AWAY')

  const onSavePick = useCallback(async () => {
    if (!selectedMatch || !canSavePick || parsedHome === undefined || parsedAway === undefined) return
    setSavingPick(true)
    try {
      const next = upsertPick(picksState.picks, {
        matchId: selectedMatch.id,
        userId,
        homeScore: parsedHome,
        awayScore: parsedAway,
        advances: requiresAdvances ? draft.advances || undefined : undefined
      })
      picksState.updatePicks(next)
      await picksState.savePicks(next)
    } finally {
      setSavingPick(false)
    }
  }, [
    canSavePick,
    draft.advances,
    parsedAway,
    parsedHome,
    picksState,
    requiresAdvances,
    selectedMatch,
    userId
  ])

  function openEditor(matchId: string) {
    setSelectedMatchId(matchId)
    setEditorOpen(true)
  }

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
        title="My Picks Hub"
        subtitle="Quick review for the next lock lives here. Use Play Center for guided picks."
        kicker="Reference + quick edit"
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
          <Card className="rounded-2xl border-border/70 bg-bg2 p-4 sm:p-5">
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
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-xs text-muted-foreground">Locks in</div>
                      <div className="text-sm font-semibold text-foreground">{nextLockCountdown}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={nextLockPicked ? 'success' : 'warning'}>
                        {nextLockPicked ? 'Picked' : 'Needs pick'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="pill"
                        onClick={() => openEditor(nextLock.match.id)}
                      >
                        Review pick
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">
                  No upcoming lock windows.
                </div>
              )}
            </div>
          </Card>

          <div className="rounded-2xl border border-border/70 bg-bg2 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rules</div>
              <Button size="sm" variant="pill" onClick={() => navigate('/play')}>
                Open Play Center
              </Button>
            </div>
            <div className="mt-2 space-y-2 text-sm text-foreground">
              <div>Picks lock 30 minutes before kickoff.</div>
              <div>Knockout ties require selecting who advances.</div>
              <div>
                {groupLockTime
                  ? `Group outcomes lock at ${formatKickoff(groupLockTime.toISOString())}.`
                  : 'Group outcomes unlock with group matches.'}
              </div>
            </div>
          </div>
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
            <MatchList
              matches={pendingOpenMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No urgent picks right now."
              onOpenEditor={(matchId) => openEditor(matchId)}
              actionLabel="Quick edit"
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
            <MatchList
              matches={completedOpenMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No completed open picks yet."
              onOpenEditor={(matchId) => openEditor(matchId)}
              actionLabel="Review"
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
            <MatchList
              matches={lockedMatches}
              picks={picksState.picks}
              userId={userId}
              now={now}
              emptyMessage="No locked picks."
              onOpenEditor={(matchId) => openEditor(matchId)}
              actionLabel="Locked"
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={safeFinishedPage <= 1}
                      onClick={() => setFinishedPage((current) => Math.max(1, current - 1))}
                    >
                      Prev
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Page {safeFinishedPage} / {finishedTotalPages}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={safeFinishedPage >= finishedTotalPages}
                      onClick={() => setFinishedPage((current) => Math.min(finishedTotalPages, current + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          className={cn(
            isDesktop ? 'w-[92vw] max-w-xl' : 'pickEditorSheetMobile rounded-t-2xl'
          )}
        >
          <SheetHeader>
            <SheetTitle>Quick edit</SheetTitle>
            <SheetDescription>For guided flow, open Play Center.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <PickEditor
              selectedMatch={selectedMatch}
              draft={draft}
              onDraftChange={setDraft}
              onSave={onSavePick}
              locked={selectedLocked}
              canSave={canSavePick}
              saving={savingPick}
              saveStatus={picksState.saveStatus}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
