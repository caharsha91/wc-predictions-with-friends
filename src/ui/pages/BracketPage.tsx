import { useEffect, useMemo, useRef, useState } from 'react'

import { getLockTime, isMatchLocked } from '../../lib/matches'
import type { Match, MatchWinner } from '../../types/matches'
import type { KnockoutStage } from '../../types/scoring'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { useBracketKnockoutData } from '../hooks/useBracketKnockoutData'
import { useNow } from '../hooks/useNow'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'

const STAGE_LABELS: Record<KnockoutStage, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  Third: 'Third Place',
  Final: 'Final'
}

type WizardMode = 'match' | 'review'

type BracketResumeState = {
  mode: WizardMode
  matchId?: string
}

type BracketEntry = {
  stage: KnockoutStage
  match: Match
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function resolveWinnerLabel(
  winner: MatchWinner | undefined,
  homeCode: string,
  awayCode: string
): string {
  if (winner === 'HOME') return `${homeCode} advances`
  if (winner === 'AWAY') return `${awayCode} advances`
  return 'Missing'
}

function getBracketWizardStorageKey(userId: string, mode: 'default' | 'demo'): string {
  return `wc-bracket-wizard:${mode}:${userId}`
}

function loadBracketResumeState(userId: string, mode: 'default' | 'demo'): BracketResumeState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getBracketWizardStorageKey(userId, mode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BracketResumeState>
    const parsedMode = parsed.mode === 'match' || parsed.mode === 'review' ? parsed.mode : 'match'
    return {
      mode: parsedMode,
      matchId: typeof parsed.matchId === 'string' ? parsed.matchId : undefined
    }
  } catch {
    return null
  }
}

function saveBracketResumeState(
  userId: string,
  value: BracketResumeState,
  mode: 'default' | 'demo'
): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getBracketWizardStorageKey(userId, mode), JSON.stringify(value))
}

export default function BracketPage() {
  const now = useNow({ tickMs: 60000 })
  const userId = useViewerId()
  const dataMode = useRouteDataMode()
  const {
    loadState,
    knockout,
    setPick,
    save,
    saveStatus,
    canPersistFirestore,
    stageOrder,
    totalMatches,
    completeMatches
  } = useBracketKnockoutData()

  const [mode, setMode] = useState<WizardMode>('match')
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const resumeLoadedRef = useRef(false)
  const resumeTargetRef = useRef<BracketResumeState | null>(null)
  const previousLockedStateRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (resumeLoadedRef.current) return
    resumeTargetRef.current = loadBracketResumeState(userId, dataMode)
    resumeLoadedRef.current = true
  }, [dataMode, userId])

  const orderedEntries = useMemo<BracketEntry[]>(() => {
    if (loadState.status !== 'ready') return []
    return stageOrder.flatMap((stage) => (loadState.byStage[stage] ?? []).map((match) => ({ stage, match })))
  }, [loadState, stageOrder])

  const entryById = useMemo(
    () => new Map(orderedEntries.map((entry) => [entry.match.id, entry] as const)),
    [orderedEntries]
  )

  const entryWinner = (entry: BracketEntry): MatchWinner | undefined =>
    knockout[entry.stage]?.[entry.match.id]
  const entryLocked = (entry: BracketEntry): boolean => isMatchLocked(entry.match.kickoffUtc, now)

  const openIncompleteEntries = useMemo(
    () => orderedEntries.filter((entry) => !entryWinner(entry) && !entryLocked(entry)),
    [knockout, now, orderedEntries]
  )

  const lockedIncompleteEntries = useMemo(
    () => orderedEntries.filter((entry) => !entryWinner(entry) && entryLocked(entry)),
    [knockout, now, orderedEntries]
  )

  const nextOpenIncompleteId = openIncompleteEntries[0]?.match.id ?? null

  const stageSummary = useMemo(
    () =>
      stageOrder
        .map((stage) => {
          const matches = loadState.status === 'ready' ? loadState.byStage[stage] ?? [] : []
          if (matches.length === 0) return null
          const complete = matches.reduce((count, match) => (knockout[stage]?.[match.id] ? count + 1 : count), 0)
          const openRemaining = matches.reduce((count, match) => {
            const locked = isMatchLocked(match.kickoffUtc, now)
            const picked = Boolean(knockout[stage]?.[match.id])
            return !locked && !picked ? count + 1 : count
          }, 0)
          return {
            stage,
            total: matches.length,
            complete,
            openRemaining
          }
        })
        .filter((value): value is NonNullable<typeof value> => value !== null),
    [knockout, loadState, now, stageOrder]
  )

  useEffect(() => {
    if (loadState.status !== 'ready') return

    const fallbackMatchId =
      nextOpenIncompleteId ??
      lockedIncompleteEntries[0]?.match.id ??
      orderedEntries[0]?.match.id ??
      null

    const resume = resumeTargetRef.current
    if (resume) {
      const resumedMatchId = resume.matchId && entryById.has(resume.matchId) ? resume.matchId : fallbackMatchId
      setActiveMatchId(resumedMatchId)
      setMode(resume.mode === 'review' || !resumedMatchId ? 'review' : 'match')
      resumeTargetRef.current = null
      return
    }

    if (activeMatchId && entryById.has(activeMatchId)) return
    setActiveMatchId(fallbackMatchId)
    setMode(fallbackMatchId ? 'match' : 'review')
  }, [activeMatchId, entryById, loadState.status, lockedIncompleteEntries, nextOpenIncompleteId, orderedEntries])

  useEffect(() => {
    if (loadState.status !== 'ready') return
    saveBracketResumeState(userId, {
      mode,
      matchId: activeMatchId ?? undefined
    }, dataMode)
  }, [activeMatchId, dataMode, loadState.status, mode, userId])

  const currentEntry = activeMatchId ? entryById.get(activeMatchId) ?? null : null
  const currentIndex = currentEntry
    ? orderedEntries.findIndex((entry) => entry.match.id === currentEntry.match.id)
    : -1
  const currentWinner = currentEntry ? entryWinner(currentEntry) : undefined
  const currentLocked = currentEntry ? entryLocked(currentEntry) : false

  useEffect(() => {
    if (!currentEntry) {
      previousLockedStateRef.current = null
      return
    }
    const wasLocked = previousLockedStateRef.current
    if (wasLocked === false && currentLocked) {
      setNotice(
        `Locked at ${formatTime(getLockTime(currentEntry.match.kickoffUtc).toISOString())}; moved to next action.`
      )
    }
    previousLockedStateRef.current = currentLocked
  }, [currentEntry, currentLocked])

  const progressPct = totalMatches > 0 ? Math.round((completeMatches / totalMatches) * 100) : 0

  function goToEntryIndex(index: number) {
    if (index < 0 || index >= orderedEntries.length) return
    setActiveMatchId(orderedEntries[index].match.id)
    setMode('match')
    setNotice(null)
  }

  function goToPreviousMatch() {
    if (orderedEntries.length === 0) return
    if (currentIndex <= 0) {
      goToEntryIndex(orderedEntries.length - 1)
      return
    }
    goToEntryIndex(currentIndex - 1)
  }

  function goToNextMatch() {
    if (orderedEntries.length === 0) return
    if (currentIndex < 0 || currentIndex >= orderedEntries.length - 1) {
      goToEntryIndex(0)
      return
    }
    goToEntryIndex(currentIndex + 1)
  }

  function findNextOpenIncompleteIndex(fromIndex: number): number {
    for (let index = fromIndex + 1; index < orderedEntries.length; index += 1) {
      const entry = orderedEntries[index]
      if (!entryWinner(entry) && !entryLocked(entry)) return index
    }
    for (let index = 0; index <= fromIndex; index += 1) {
      const entry = orderedEntries[index]
      if (!entryWinner(entry) && !entryLocked(entry)) return index
    }
    return -1
  }

  function jumpToNextAction() {
    if (orderedEntries.length === 0) {
      setMode('review')
      return
    }
    const fromIndex = currentIndex < 0 ? -1 : currentIndex
    const nextIndex = findNextOpenIncompleteIndex(fromIndex)
    if (nextIndex >= 0) {
      goToEntryIndex(nextIndex)
      return
    }
    setMode('review')
    setNotice('All currently open bracket picks are complete.')
  }

  function handleSetWinner(winner: MatchWinner) {
    if (!currentEntry || currentLocked) return
    setPick(currentEntry.stage, currentEntry.match.id, winner)
    setNotice(null)
  }

  function handleClearWinner() {
    if (!currentEntry || currentLocked) return
    setPick(currentEntry.stage, currentEntry.match.id, undefined)
    setNotice(null)
  }

  function handleContinue() {
    if (!currentEntry) return
    if (currentLocked) {
      jumpToNextAction()
      return
    }
    if (!currentWinner) {
      setNotice('Select who advances before continuing.')
      return
    }
    jumpToNextAction()
  }

  if (loadState.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (loadState.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load bracket">
        {loadState.message}
      </Alert>
    )
  }

  const summaryRows = orderedEntries.map((entry) => ({
    stage: entry.stage,
    matchId: entry.match.id,
    matchLabel: `${entry.match.homeTeam.code} vs ${entry.match.awayTeam.code}`,
    kickoff: entry.match.kickoffUtc,
    winner: entryWinner(entry),
    homeCode: entry.match.homeTeam.code,
    awayCode: entry.match.awayTeam.code
  }))

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Bracket"
        title="Knockout Picks Wizard"
        subtitle="Complete open knockout picks one match at a time, then review and save."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(loadState.lastUpdated)}</div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Next action</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {mode === 'match' && currentEntry
                  ? `${STAGE_LABELS[currentEntry.stage]} · ${currentEntry.match.homeTeam.code} vs ${currentEntry.match.awayTeam.code}`
                  : 'Review and save bracket'}
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              Step {mode === 'match' ? Math.max(1, currentIndex + 1) : orderedEntries.length} of {orderedEntries.length || 1}
            </div>
          </div>

          <div className="h-2 rounded-full bg-bg2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={completeMatches < totalMatches ? 'warning' : 'success'}>
              Completed {completeMatches}/{totalMatches}
            </Badge>
            <Badge tone={openIncompleteEntries.length > 0 ? 'info' : 'success'}>
              Open remaining {openIncompleteEntries.length}
            </Badge>
            <Badge tone={lockedIncompleteEntries.length > 0 ? 'locked' : 'secondary'}>
              Locked waiting {lockedIncompleteEntries.length}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={jumpToNextAction}>
              Resume next action
            </Button>
            <Button variant="ghost" onClick={() => setMode('review')}>
              Review picks
            </Button>
            <Button variant="secondary" onClick={() => void save()} loading={saveStatus === 'saving'}>
              Save bracket
            </Button>
            {saveStatus === 'saved' ? (
              <Badge tone="success">{canPersistFirestore ? 'Synced' : 'Saved in browser'}</Badge>
            ) : null}
            {saveStatus === 'error' ? <Badge tone="danger">Save failed</Badge> : null}
          </div>

          {notice ? <div className="text-xs text-muted-foreground">{notice}</div> : null}
        </div>
      </PageHeroPanel>

      {mode === 'match' && currentEntry ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bracket step</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {currentEntry.match.homeTeam.name} vs {currentEntry.match.awayTeam.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {STAGE_LABELS[currentEntry.stage]} · Kickoff {formatTime(currentEntry.match.kickoffUtc)} · Locks{' '}
                  {formatTime(getLockTime(currentEntry.match.kickoffUtc).toISOString())}
                </div>
              </div>
              <Badge tone={currentLocked ? 'locked' : 'info'}>{currentLocked ? 'Locked' : 'Open'}</Badge>
            </div>

            {currentLocked ? (
              <Alert tone="warning" title="Locked">
                This matchup is locked and cannot be edited. Continue to the next open item.
              </Alert>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                className={currentWinner === 'HOME' ? 'border-primary' : ''}
                disabled={currentLocked}
                onClick={() => handleSetWinner('HOME')}
              >
                {currentEntry.match.homeTeam.code} advances
              </Button>
              <Button
                variant="secondary"
                className={currentWinner === 'AWAY' ? 'border-primary' : ''}
                disabled={currentLocked}
                onClick={() => handleSetWinner('AWAY')}
              >
                {currentEntry.match.awayTeam.code} advances
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentWinner ? <Badge tone="success">{resolveWinnerLabel(currentWinner, currentEntry.match.homeTeam.code, currentEntry.match.awayTeam.code)}</Badge> : <Badge tone="warning">Pick missing</Badge>}
              {!currentLocked ? (
                <Button variant="ghost" onClick={handleClearWinner}>
                  Clear pick
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goToPreviousMatch} disabled={orderedEntries.length === 0}>
                Previous match
              </Button>
              <Button variant="secondary" onClick={goToNextMatch} disabled={orderedEntries.length === 0}>
                Next match
              </Button>
              <Button onClick={handleContinue} disabled={!currentLocked && !currentWinner}>
                {currentLocked ? 'Go to next action' : 'Continue'}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {mode === 'review' ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Review step</div>
            <div className="text-lg font-semibold text-foreground">Bracket review and completion status</div>
            <div className="text-sm text-muted-foreground">
              Open remaining: {openIncompleteEntries.length}. Locked waiting: {lockedIncompleteEntries.length}.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={jumpToNextAction} disabled={openIncompleteEntries.length === 0}>
                Back to next action
              </Button>
              <Button variant="secondary" onClick={() => void save()} loading={saveStatus === 'saving'}>
                Save bracket
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Accordion type="single" collapsible className="space-y-3">
        <AccordionItem value="stage-summary">
          <AccordionTrigger>Stage Summary</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stageSummary.map((stage) => (
                <div key={stage.stage} className="rounded-xl border border-border/70 bg-bg2 p-3">
                  <div className="text-sm font-semibold text-foreground">{STAGE_LABELS[stage.stage]}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Completed {stage.complete}/{stage.total}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Open remaining {stage.openRemaining}</div>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="full-review">
          <AccordionTrigger>Full Bracket Review</AccordionTrigger>
          <AccordionContent>
            <Table>
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Match</th>
                  <th>Kickoff</th>
                  <th>Your pick</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row) => (
                  <tr key={`${row.stage}-${row.matchId}`}>
                    <td>{STAGE_LABELS[row.stage]}</td>
                    <td>{row.matchLabel}</td>
                    <td>{formatTime(row.kickoff)}</td>
                    <td>
                      <span className={row.winner ? 'text-foreground' : 'text-muted-foreground'}>
                        {resolveWinnerLabel(row.winner, row.homeCode, row.awayCode)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
