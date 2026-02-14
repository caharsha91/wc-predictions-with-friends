import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchPicks } from '../../../lib/data'
import { getLockTime, isMatchLocked } from '../../../lib/matches'
import { findPick, isPickComplete, upsertPick } from '../../../lib/picks'
import type { Match } from '../../../types/matches'
import type { Pick, PickAdvances } from '../../../types/picks'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { useToast } from '../../hooks/useToast'
import { useViewerId } from '../../hooks/useViewerId'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import Skeleton from '../ui/Skeleton'

type DraftPick = {
  homeScore: string
  awayScore: string
  advances: '' | PickAdvances
}

type WizardStepKind = 'match' | 'review' | 'confirm'

type ResumeState = {
  stepKind: WizardStepKind
  matchId?: string
}

type ConsensusSignal = {
  winner: 'HOME' | 'AWAY'
  sharePct: number
  totalVotes: number
}

type WizardStep =
  | { kind: 'match'; matchId: string }
  | { kind: 'review' }
  | { kind: 'confirm' }

type PicksWizardFlowProps = {
  layout?: 'standalone' | 'compact-inline'
  onOpenReferencePage?: () => void
  activeMatchId?: string | null
  onActiveMatchChange?: (matchId: string | null) => void
}

function formatKickoff(utcIso: string): string {
  return new Date(utcIso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function parseScore(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.floor(parsed))
}

function formatDurationMs(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`
}

function toDraft(pick?: Pick): DraftPick {
  return {
    homeScore: typeof pick?.homeScore === 'number' ? String(pick.homeScore) : '',
    awayScore: typeof pick?.awayScore === 'number' ? String(pick.awayScore) : '',
    advances: pick?.advances ?? ''
  }
}

function resolveWinnerSide(
  homeScore: number | undefined,
  awayScore: number | undefined,
  advances: PickAdvances | '' | undefined,
  legacyWinner?: 'HOME' | 'AWAY'
): 'HOME' | 'AWAY' | null {
  if (homeScore !== undefined && awayScore !== undefined) {
    if (homeScore > awayScore) return 'HOME'
    if (awayScore > homeScore) return 'AWAY'
    if (advances === 'HOME' || advances === 'AWAY') return advances
  }
  if (legacyWinner === 'HOME' || legacyWinner === 'AWAY') return legacyWinner
  if (advances === 'HOME' || advances === 'AWAY') return advances
  return null
}

function getWizardStorageKey(userId: string, mode: 'default' | 'demo') {
  return `wc-picks-wizard:${mode}:${userId}`
}

function loadResumeState(userId: string, mode: 'default' | 'demo'): ResumeState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getWizardStorageKey(userId, mode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ResumeState>
    const stepKind =
      parsed.stepKind === 'match' || parsed.stepKind === 'review' || parsed.stepKind === 'confirm'
        ? parsed.stepKind
        : 'match'
    return {
      stepKind,
      matchId: typeof parsed.matchId === 'string' ? parsed.matchId : undefined
    }
  } catch {
    return null
  }
}

function saveResumeState(userId: string, value: ResumeState, mode: 'default' | 'demo'): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getWizardStorageKey(userId, mode), JSON.stringify(value))
}

export default function PicksWizardFlow({
  layout = 'standalone',
  onOpenReferencePage,
  activeMatchId,
  onActiveMatchChange
}: PicksWizardFlowProps) {
  const navigate = useNavigate()
  const now = useNow({ tickMs: 30_000 })
  const userId = useViewerId()
  const mode = useRouteDataMode()
  const { showToast } = useToast()
  const picksState = usePicksData()

  const isCompactInline = layout === 'compact-inline'
  const openReferencePage = useCallback(() => {
    if (onOpenReferencePage) {
      onOpenReferencePage()
      return
    }
    navigate('/play/picks')
  }, [navigate, onOpenReferencePage])

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [activeMatchDraft, setActiveMatchDraft] = useState<DraftPick>({
    homeScore: '',
    awayScore: '',
    advances: ''
  })
  const [savingMatch, setSavingMatch] = useState(false)
  const [savingFinal, setSavingFinal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [snapshotPicks, setSnapshotPicks] = useState<{ userId: string; picks: Pick[] }[]>([])

  const resumeLoadedRef = useRef(false)
  const resumeTargetRef = useRef<{ kind: WizardStepKind; matchId?: string } | null>(null)
  const initialStepRef = useRef(false)
  const previousLockedStateRef = useRef<boolean | null>(null)
  const syncingExternalFocusRef = useRef<string | null>(null)

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []

  useEffect(() => {
    let canceled = false
    async function loadSnapshotPicks() {
      try {
        const file = await fetchPicks({ mode })
        if (canceled) return
        setSnapshotPicks(file.picks.map((entry) => ({ userId: entry.userId, picks: entry.picks })))
      } catch {
        if (!canceled) setSnapshotPicks([])
      }
    }
    void loadSnapshotPicks()
    return () => {
      canceled = true
    }
  }, [mode])

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

  useEffect(() => {
    if (resumeLoadedRef.current) return
    const resume = loadResumeState(userId, mode)
    if (resume) {
      resumeTargetRef.current = { kind: resume.stepKind, matchId: resume.matchId }
    }
    resumeLoadedRef.current = true
  }, [mode, userId])

  const steps = useMemo<WizardStep[]>(() => {
    const nextSteps: WizardStep[] = []
    for (const match of openMatches) {
      nextSteps.push({ kind: 'match', matchId: match.id })
    }
    nextSteps.push({ kind: 'review' })
    nextSteps.push({ kind: 'confirm' })
    return nextSteps
  }, [openMatches])

  const openMatchById = useMemo(
    () => new Map(openMatches.map((match) => [match.id, match] as const)),
    [openMatches]
  )

  const isMatchStepComplete = useCallback(
    (matchId: string) => {
      const match = openMatchById.get(matchId)
      if (!match) return true
      const pick = findPick(picksState.picks, matchId, userId)
      return isPickComplete(match, pick)
    },
    [openMatchById, picksState.picks, userId]
  )

  useEffect(() => {
    setCurrentStepIndex((current) => Math.min(current, Math.max(steps.length - 1, 0)))
  }, [steps.length])

  useEffect(() => {
    if (steps.length === 0) return

    const resume = resumeTargetRef.current
    if (resume) {
      const index = steps.findIndex((step) => {
        if (step.kind !== resume.kind) return false
        if (step.kind !== 'match') return true
        return step.matchId === resume.matchId
      })
      setCurrentStepIndex(index >= 0 ? index : 0)
      resumeTargetRef.current = null
      initialStepRef.current = true
      return
    }

    if (initialStepRef.current) return

    const nextIncompleteIndex = steps.findIndex((step) => {
      if (step.kind !== 'match') return false
      return !isMatchStepComplete(step.matchId)
    })
    if (nextIncompleteIndex >= 0) {
      setCurrentStepIndex(nextIncompleteIndex)
      initialStepRef.current = true
      return
    }

    const reviewIndex = steps.findIndex((step) => step.kind === 'review')
    setCurrentStepIndex(reviewIndex >= 0 ? reviewIndex : 0)
    initialStepRef.current = true
  }, [isMatchStepComplete, steps])

  useEffect(() => {
    if (!notice) return
    showToast({ title: 'Action needed', message: notice, tone: 'warning' })
    setNotice(null)
  }, [notice, showToast])

  useEffect(() => {
    if (!activeMatchId) return
    const focusIndex = steps.findIndex((step) => step.kind === 'match' && step.matchId === activeMatchId)
    if (focusIndex < 0) return
    syncingExternalFocusRef.current = activeMatchId
    setCurrentStepIndex((current) => (current === focusIndex ? current : focusIndex))
  }, [activeMatchId, steps])

  const currentStep = steps[Math.min(currentStepIndex, Math.max(steps.length - 1, 0))]
  const currentMatch =
    currentStep?.kind === 'match'
      ? openMatches.find((match) => match.id === currentStep.matchId) ?? null
      : null

  useEffect(() => {
    if (!onActiveMatchChange) return
    const currentMatchId = currentStep?.kind === 'match' ? currentStep.matchId : null

    if (syncingExternalFocusRef.current) {
      if (currentMatchId === syncingExternalFocusRef.current) {
        syncingExternalFocusRef.current = null
      }
      return
    }

    onActiveMatchChange(currentMatchId)
  }, [currentStep, onActiveMatchChange])

  const currentPick = useMemo(
    () => (currentMatch ? findPick(picksState.picks, currentMatch.id, userId) : undefined),
    [currentMatch, picksState.picks, userId]
  )

  const consensusByMatchId = useMemo(() => {
    const countsByMatch = new Map<string, { home: number; away: number }>()
    for (const doc of snapshotPicks) {
      for (const pick of doc.picks) {
        const side = resolveWinnerSide(pick.homeScore, pick.awayScore, pick.advances, pick.winner)
        if (!side) continue
        const current = countsByMatch.get(pick.matchId) ?? { home: 0, away: 0 }
        if (side === 'HOME') current.home += 1
        if (side === 'AWAY') current.away += 1
        countsByMatch.set(pick.matchId, current)
      }
    }

    const consensus = new Map<string, ConsensusSignal>()
    for (const [matchId, count] of countsByMatch.entries()) {
      const totalVotes = count.home + count.away
      if (totalVotes === 0) continue
      if (count.home === count.away) continue
      const winner = count.home > count.away ? 'HOME' : 'AWAY'
      const winnerCount = winner === 'HOME' ? count.home : count.away
      consensus.set(matchId, {
        winner,
        sharePct: Math.round((winnerCount / totalVotes) * 100),
        totalVotes
      })
    }
    return consensus
  }, [snapshotPicks])

  useEffect(() => {
    setActiveMatchDraft(toDraft(currentPick))
  }, [currentPick?.id, currentPick?.updatedAt, currentMatch?.id])

  useEffect(() => {
    if (!currentStep) return
    saveResumeState(userId, {
      stepKind: currentStep.kind,
      matchId: currentStep.kind === 'match' ? currentStep.matchId : undefined
    }, mode)
  }, [currentStep, mode, userId])

  const parsedHome = parseScore(activeMatchDraft.homeScore)
  const parsedAway = parseScore(activeMatchDraft.awayScore)
  const tieInput = parsedHome !== undefined && parsedAway !== undefined && parsedHome === parsedAway
  const requiresAdvances = currentMatch ? currentMatch.stage !== 'Group' && tieInput : false

  const matchLocked = currentMatch ? isMatchLocked(currentMatch.kickoffUtc, now) : false
  const matchCanSave =
    !!currentMatch &&
    !matchLocked &&
    parsedHome !== undefined &&
    parsedAway !== undefined &&
    (!requiresAdvances || activeMatchDraft.advances === 'HOME' || activeMatchDraft.advances === 'AWAY')

  const currentConsensus = currentMatch ? consensusByMatchId.get(currentMatch.id) ?? null : null
  const activeDraftWinner = resolveWinnerSide(parsedHome, parsedAway, activeMatchDraft.advances, currentPick?.winner)
  const contrarian =
    !!currentConsensus &&
    !!activeDraftWinner &&
    activeDraftWinner !== currentConsensus.winner

  useEffect(() => {
    if (!currentMatch) {
      previousLockedStateRef.current = null
      return
    }
    const wasLocked = previousLockedStateRef.current
    if (wasLocked === false && matchLocked) {
      setNotice("Time's up — this one closed. We'll move you along.")
    }
    previousLockedStateRef.current = matchLocked
  }, [currentMatch, matchLocked])

  const progressDone = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return isPickComplete(match, pick)
      }).length,
    [openMatches, picksState.picks, userId]
  )

  const progressTotal = openMatches.length
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0

  const missingMatches = useMemo(
    () =>
      openMatches.filter((match) => {
        const pick = findPick(picksState.picks, match.id, userId)
        return !isPickComplete(match, pick)
      }),
    [openMatches, picksState.picks, userId]
  )

  const reviewReady = missingMatches.length === 0
  const showReviewSubmitCta = reviewReady || currentStep?.kind === 'review' || currentStep?.kind === 'confirm'

  const saveCurrentMatch = useCallback(async () => {
    if (!currentMatch || !matchCanSave || parsedHome === undefined || parsedAway === undefined) return false

    setSavingMatch(true)
    const startedAt = performance.now()
    try {
      const next = upsertPick(picksState.picks, {
        matchId: currentMatch.id,
        userId,
        homeScore: parsedHome,
        awayScore: parsedAway,
        advances: requiresAdvances ? activeMatchDraft.advances || undefined : undefined
      })
      picksState.updatePicks(next)
      await picksState.savePicks(next)
      showToast({
        title: 'Saved',
        message: `Saved 1 pick in ${formatDurationMs(performance.now() - startedAt)}.`,
        tone: 'success'
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save pick.'
      showToast({ title: 'Save failed', message, tone: 'danger' })
      return false
    } finally {
      setSavingMatch(false)
    }
  }, [
    activeMatchDraft.advances,
    currentMatch,
    matchCanSave,
    parsedAway,
    parsedHome,
    picksState,
    requiresAdvances,
    userId,
    showToast
  ])

  function goNextStep() {
    setCurrentStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  function goPrevStep() {
    setCurrentStepIndex((current) => Math.max(current - 1, 0))
  }

  function findNextIncompleteMatchStepIndex(fromIndex: number): number {
    for (let index = fromIndex + 1; index < steps.length; index += 1) {
      const step = steps[index]
      if (step.kind !== 'match') continue
      if (!isMatchStepComplete(step.matchId)) return index
    }
    return -1
  }

  function findStepIndex(kind: WizardStepKind): number {
    return steps.findIndex((step) => step.kind === kind)
  }

  function goToNextActionStep(fromIndex: number) {
    const nextIncompleteIndex = findNextIncompleteMatchStepIndex(fromIndex)
    if (nextIncompleteIndex >= 0) {
      setCurrentStepIndex(nextIncompleteIndex)
      return
    }

    const reviewIndex = findStepIndex('review')
    if (reviewIndex > fromIndex) {
      setCurrentStepIndex(reviewIndex)
      return
    }

    const confirmIndex = findStepIndex('confirm')
    if (confirmIndex > fromIndex) {
      setCurrentStepIndex(confirmIndex)
      return
    }

    setCurrentStepIndex(Math.min(fromIndex + 1, steps.length - 1))
  }

  function goToNextIncompleteMatch() {
    const nextIncompleteIndex = findNextIncompleteMatchStepIndex(currentStepIndex)
    if (nextIncompleteIndex >= 0) {
      setCurrentStepIndex(nextIncompleteIndex)
      return
    }

    const firstIncompleteIndex = steps.findIndex((step) => {
      if (step.kind !== 'match') return false
      return !isMatchStepComplete(step.matchId)
    })
    if (firstIncompleteIndex >= 0) {
      setCurrentStepIndex(firstIncompleteIndex)
      return
    }

    const reviewIndex = findStepIndex('review')
    if (reviewIndex >= 0) {
      setCurrentStepIndex(reviewIndex)
    }
  }

  function jumpToReviewStep() {
    const reviewIndex = findStepIndex('review')
    if (reviewIndex >= 0) {
      setCurrentStepIndex(reviewIndex)
    }
  }

  async function handleMatchContinue() {
    if (!currentMatch) return

    if (matchLocked) {
      setNotice("Time's up — this one closed. We'll move you along.")
      goToNextActionStep(currentStepIndex)
      return
    }

    if (isPickComplete(currentMatch, currentPick)) {
      goToNextActionStep(currentStepIndex)
      return
    }

    if (matchCanSave) {
      const saved = await saveCurrentMatch()
      if (saved) goToNextActionStep(currentStepIndex)
      return
    }

    if (requiresAdvances && !(activeMatchDraft.advances === 'HOME' || activeMatchDraft.advances === 'AWAY')) {
      setNotice('Knockout ties require selecting who advances before continuing.')
      return
    }

    setNotice('Enter both scores before continuing.')
  }

  async function handleSubmitAll() {
    if (!reviewReady) {
      setNotice('Resolve missing picks before submitting.')
      return
    }

    setSavingFinal(true)
    const startedAt = performance.now()
    try {
      await picksState.savePicks(picksState.picks)
      showToast({
        title: 'Saved',
        message: `Saved ${progressDone} picks in ${formatDurationMs(performance.now() - startedAt)}.`,
        tone: 'success'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit picks.'
      showToast({ title: 'Save failed', message, tone: 'danger' })
    } finally {
      setSavingFinal(false)
    }
  }

  function moveMatchStep(direction: 1 | -1) {
    for (let index = currentStepIndex + direction; index >= 0 && index < steps.length; index += direction) {
      const step = steps[index]
      if (step.kind === 'match') {
        setCurrentStepIndex(index)
        return
      }
    }
  }

  function handleKeyboardShortcut(event: KeyboardEvent<HTMLDivElement>) {
    if (!currentStep || currentStep.kind !== 'match') return
    const target = event.target as HTMLElement
    const tagName = target.tagName.toLowerCase()
    const isEditable = tagName === 'input' || tagName === 'textarea' || target.isContentEditable
    const isButton = tagName === 'button'

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !isButton) {
      event.preventDefault()
      void handleMatchContinue()
      return
    }

    if (isEditable) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveMatchStep(1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveMatchStep(-1)
    }
  }

  if (picksState.state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    )
  }

  if (picksState.state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load wizard">
        {picksState.state.message}
      </Alert>
    )
  }

  return (
    <div className={isCompactInline ? 'space-y-4' : 'space-y-6'} onKeyDown={handleKeyboardShortcut}>
      {!isCompactInline ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Picks wizard</div>
            <div className="text-lg font-semibold text-foreground">Guided Picks Entry</div>
            <div className="text-sm text-muted-foreground">
              Edit all open picks one-by-one, then review and confirm.
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">
                Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
              </div>
              <div className="text-xs text-muted-foreground">
                Match completion {progressDone}/{progressTotal}
              </div>
            </div>
            <div className="h-2 rounded-full bg-bg2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={progressDone < progressTotal ? 'warning' : 'success'}>
                Pending {Math.max(0, progressTotal - progressDone)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={openReferencePage}>
                Open picks reference
              </Button>
              <Button variant="secondary" onClick={goToNextIncompleteMatch} disabled={missingMatches.length === 0}>
                Go to next incomplete
              </Button>
              {showReviewSubmitCta ? (
                <Button variant="secondary" onClick={jumpToReviewStep}>
                  Review & submit
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {openMatches.length === 0 ? (
        <Alert tone="info" title="You're chill.">
          Nothing open right now. Check results or the league.
        </Alert>
      ) : null}

      {currentStep?.kind === 'match' && currentMatch ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Now playing</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {currentMatch.homeTeam.code} vs {currentMatch.awayTeam.code}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentMatch.stage} · Kick {formatKickoff(currentMatch.kickoffUtc)} · Closes{' '}
                  {formatKickoff(getLockTime(currentMatch.kickoffUtc).toISOString())}
                </div>
                {currentConsensus ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="info">
                      Most picked:{' '}
                      {currentConsensus.winner === 'HOME'
                        ? currentMatch.homeTeam.code
                        : currentMatch.awayTeam.code}{' '}
                      {currentConsensus.sharePct}%
                    </Badge>
                    <Badge tone="secondary">{currentConsensus.totalVotes} votes</Badge>
                    {contrarian ? <Badge tone="warning">Contrarian</Badge> : null}
                  </div>
                ) : null}
              </div>
              <Badge tone={matchLocked ? 'locked' : 'info'}>{matchLocked ? 'Closed' : 'Live'}</Badge>
            </div>

            {matchLocked ? (
              <Alert tone="warning" title="Closed">
                Time&apos;s up — this one closed. We&apos;ll move you along.
              </Alert>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {currentMatch.homeTeam.code} score
                </div>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={activeMatchDraft.homeScore}
                  disabled={matchLocked}
                  onChange={(event) =>
                    setActiveMatchDraft((current) => ({ ...current, homeScore: event.target.value }))
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {currentMatch.awayTeam.code} score
                </div>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={activeMatchDraft.awayScore}
                  disabled={matchLocked}
                  onChange={(event) =>
                    setActiveMatchDraft((current) => ({ ...current, awayScore: event.target.value }))
                  }
                />
              </div>
            </div>

            {currentMatch.stage !== 'Group' ? (
              <div className="rounded-xl border border-border/70 bg-bg2 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Knockout tie rule</div>
                <div className="mt-1 text-sm text-foreground">Tie game — pick who advances.</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    data-active={activeMatchDraft.advances === 'HOME' ? 'true' : 'false'}
                    className={activeMatchDraft.advances === 'HOME' ? 'border-primary' : ''}
                    disabled={matchLocked || !requiresAdvances}
                    onClick={() => setActiveMatchDraft((current) => ({ ...current, advances: 'HOME' }))}
                  >
                    {currentMatch.homeTeam.code} advances
                  </Button>
                  <Button
                    variant="secondary"
                    data-active={activeMatchDraft.advances === 'AWAY' ? 'true' : 'false'}
                    className={activeMatchDraft.advances === 'AWAY' ? 'border-primary' : ''}
                    disabled={matchLocked || !requiresAdvances}
                    onClick={() => setActiveMatchDraft((current) => ({ ...current, advances: 'AWAY' }))}
                  >
                    {currentMatch.awayTeam.code} advances
                  </Button>
                </div>
                {requiresAdvances &&
                !(activeMatchDraft.advances === 'HOME' || activeMatchDraft.advances === 'AWAY') ? (
                  <div className="mt-2 text-xs text-destructive">Required to continue.</div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Back
              </Button>
              <Button
                variant="secondary"
                onClick={() => void saveCurrentMatch()}
                disabled={!matchCanSave}
                loading={savingMatch}
              >
                Save
              </Button>
              <Button onClick={() => void handleMatchContinue()} loading={savingMatch}>
                Save + Next
              </Button>
            </div>
            {isCompactInline ? (
              <div className="text-xs text-muted-foreground">
                Keyboard: ↑/↓ move matches · Enter save + next
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {currentStep?.kind === 'review' ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Review step</div>
              <div className="mt-1 text-lg font-semibold text-foreground">Check before confirm</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-bg2 p-3">
              <div className="text-sm font-semibold text-foreground">Match picks</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Completed {progressDone} of {progressTotal}
              </div>
              {missingMatches.length > 0 ? (
                <div className="mt-2 text-xs text-destructive">
                  Missing: {missingMatches.map((match) => `${match.homeTeam.code}-${match.awayTeam.code}`).join(', ')}
                </div>
              ) : (
                <div className="mt-2 text-xs text-foreground">All open matches complete.</div>
              )}
            </div>

            {!reviewReady ? (
              <Alert tone="warning" title="Action required">
                Complete missing picks before confirming.
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Back
              </Button>
              <Button onClick={goNextStep} disabled={!reviewReady}>
                Continue to confirm
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {currentStep?.kind === 'confirm' ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Confirm step</div>
              <div className="mt-1 text-lg font-semibold text-foreground">Submit picks</div>
              <div className="mt-1 text-sm text-muted-foreground">
                This syncs your picks and keeps resume state for future updates.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={reviewReady ? 'success' : 'warning'}>
                {reviewReady ? 'Ready to submit' : 'Resolve issues first'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Back
              </Button>
              <Button onClick={() => void handleSubmitAll()} disabled={!reviewReady} loading={savingFinal}>
                Confirm & submit
              </Button>
              <Button variant="secondary" onClick={openReferencePage}>
                Back to My Picks Hub
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
