import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchScoring } from '../../lib/data'
import { getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete, upsertPick } from '../../lib/picks'
import type { GroupPrediction } from '../../types/bracket'
import type { Match, Team } from '../../types/matches'
import type { Pick, PickAdvances } from '../../types/picks'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import PageHeroPanel from '../components/ui/PageHeroPanel'
import Skeleton from '../components/ui/Skeleton'
import { useGroupOutcomesData } from '../hooks/useGroupOutcomesData'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useViewerId } from '../hooks/useViewerId'

type DraftPick = {
  homeScore: string
  awayScore: string
  advances: '' | PickAdvances
}

type ResumeState = {
  stepKind: WizardStepKind
  matchId?: string
}

type WizardStepKind = 'match' | 'group' | 'review' | 'confirm'

type WizardStep =
  | { kind: 'match'; matchId: string }
  | { kind: 'group' }
  | { kind: 'review' }
  | { kind: 'confirm' }

const DEFAULT_BEST_THIRD_SLOTS = 8

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

function toDraft(pick?: Pick): DraftPick {
  return {
    homeScore: typeof pick?.homeScore === 'number' ? String(pick.homeScore) : '',
    awayScore: typeof pick?.awayScore === 'number' ? String(pick.awayScore) : '',
    advances: pick?.advances ?? ''
  }
}

function buildGroupTeams(matches: Match[]): Record<string, Team[]> {
  const groups = new Map<string, Map<string, Team>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const existing = groups.get(match.group) ?? new Map<string, Team>()
    existing.set(match.homeTeam.code, match.homeTeam)
    existing.set(match.awayTeam.code, match.awayTeam)
    groups.set(match.group, existing)
  }

  const next: Record<string, Team[]> = {}
  for (const [groupId, teamMap] of groups.entries()) {
    next[groupId] = [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }
  return next
}

function getGroupValidationErrors(
  groups: Record<string, GroupPrediction>,
  groupIds: string[]
): Record<string, { first?: string; second?: string }> {
  const errors: Record<string, { first?: string; second?: string }> = {}
  for (const groupId of groupIds) {
    const group = groups[groupId] ?? {}
    if (!group.first) {
      errors[groupId] = { ...(errors[groupId] ?? {}), first: 'Required' }
    }
    if (!group.second) {
      errors[groupId] = { ...(errors[groupId] ?? {}), second: 'Required' }
    }
    if (group.first && group.second && group.first === group.second) {
      errors[groupId] = {
        first: 'Pick two different teams',
        second: 'Pick two different teams'
      }
    }
  }
  return errors
}

function getBestThirdErrors(bestThirds: string[], slots: number): string[] {
  const errors: string[] = []
  const normalized = [...bestThirds]
  while (normalized.length < slots) normalized.push('')

  const seen = new Map<string, number[]>()
  normalized.forEach((code, index) => {
    if (!code) {
      errors[index] = 'Required'
      return
    }
    const list = seen.get(code) ?? []
    list.push(index)
    seen.set(code, list)
  })
  for (const indexes of seen.values()) {
    if (indexes.length <= 1) continue
    for (const index of indexes) {
      errors[index] = 'Duplicate team'
    }
  }
  return errors
}

function getWizardStorageKey(userId: string) {
  return `wc-picks-wizard:${userId}`
}

function loadResumeState(userId: string): ResumeState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getWizardStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ResumeState>
    const stepKind =
      parsed.stepKind === 'match' ||
      parsed.stepKind === 'group' ||
      parsed.stepKind === 'review' ||
      parsed.stepKind === 'confirm'
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

function saveResumeState(userId: string, value: ResumeState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getWizardStorageKey(userId), JSON.stringify(value))
}

export default function PicksWizardPage() {
  const now = useNow()
  const userId = useViewerId()
  const picksState = usePicksData()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [activeMatchDraft, setActiveMatchDraft] = useState<DraftPick>({
    homeScore: '',
    awayScore: '',
    advances: ''
  })
  const [savingMatch, setSavingMatch] = useState(false)
  const [savingFinal, setSavingFinal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [showBestThirds, setShowBestThirds] = useState(false)
  const [finalSaved, setFinalSaved] = useState(false)
  const resumeRef = useRef(false)
  const initialStepRef = useRef(false)
  const resumeTargetRef = useRef<{ kind: WizardStepKind; matchId?: string } | null>(null)
  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []

  useEffect(() => {
    let canceled = false
    async function loadScoring() {
      try {
        const scoring = await fetchScoring()
        if (!canceled) setShowBestThirds((scoring.bracket?.thirdPlaceQualifiers ?? 0) > 0)
      } catch {
        if (!canceled) setShowBestThirds(false)
      }
    }
    void loadScoring()
    return () => {
      canceled = true
    }
  }, [])

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
    if (resumeRef.current) return
    const resume = loadResumeState(userId)
    if (!resume) {
      resumeRef.current = true
      return
    }
    resumeTargetRef.current = { kind: resume.stepKind, matchId: resume.matchId }
    resumeRef.current = true
  }, [userId])

  const groupOutcomes = useGroupOutcomesData(matches)
  const includeGroupStep = groupOutcomes.groupIds.length > 0
  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])
  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const bestThirdSlots = Math.max(DEFAULT_BEST_THIRD_SLOTS, groupOutcomes.data.bestThirds.length)

  const allGroupTeams = useMemo(() => {
    const teamMap = new Map<string, Team>()
    for (const teams of Object.values(groupTeams)) {
      for (const team of teams) {
        teamMap.set(team.code, team)
      }
    }
    return [...teamMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [groupTeams])

  const groupErrors = useMemo(
    () => getGroupValidationErrors(groupOutcomes.data.groups, groupOutcomes.groupIds),
    [groupOutcomes.data.groups, groupOutcomes.groupIds]
  )

  const bestThirdErrors = useMemo(
    () => (showBestThirds ? getBestThirdErrors(groupOutcomes.data.bestThirds, bestThirdSlots) : []),
    [bestThirdSlots, groupOutcomes.data.bestThirds, showBestThirds]
  )

  const groupHasErrors =
    Object.keys(groupErrors).length > 0 || (showBestThirds && bestThirdErrors.some(Boolean))

  const steps = useMemo<WizardStep[]>(() => {
    const nextSteps: WizardStep[] = []
    for (const match of openMatches) {
      nextSteps.push({ kind: 'match', matchId: match.id })
    }
    if (includeGroupStep) nextSteps.push({ kind: 'group' })
    nextSteps.push({ kind: 'review' })
    nextSteps.push({ kind: 'confirm' })
    return nextSteps
  }, [includeGroupStep, openMatches])

  const openMatchById = useMemo(
    () => new Map(openMatches.map((match) => [match.id, match] as const)),
    [openMatches]
  )
  const isMatchStepComplete = useCallback((matchId: string) => {
    const match = openMatchById.get(matchId)
    if (!match) return true
    const pick = findPick(picksState.picks, matchId, userId)
    return isPickComplete(match, pick)
  }, [openMatchById, picksState.picks, userId])

  useEffect(() => {
    setCurrentStepIndex((current) => Math.min(current, Math.max(steps.length - 1, 0)))
  }, [steps.length])

  useEffect(() => {
    if (steps.length === 0) return
    const target = resumeTargetRef.current
    if (target) {
      const index = steps.findIndex((step) => {
        if (step.kind !== target.kind) return false
        if (step.kind !== 'match') return true
        return step.matchId === target.matchId
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

  const currentStep = steps[Math.min(currentStepIndex, Math.max(0, steps.length - 1))]
  const currentMatch = currentStep?.kind === 'match'
    ? openMatches.find((match) => match.id === currentStep.matchId) ?? null
    : null
  const currentPick = useMemo(
    () => (currentMatch ? findPick(picksState.picks, currentMatch.id, userId) : undefined),
    [currentMatch, picksState.picks, userId]
  )

  useEffect(() => {
    setActiveMatchDraft(toDraft(currentPick))
  }, [currentPick?.id, currentPick?.updatedAt, currentMatch?.id])

  useEffect(() => {
    if (!currentStep) return
    saveResumeState(userId, {
      stepKind: currentStep.kind,
      matchId: currentStep.kind === 'match' ? currentStep.matchId : undefined
    })
  }, [currentStep, userId])

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

  const reviewReady =
    missingMatches.length === 0 &&
    (!includeGroupStep || groupLocked || (groupOutcomes.loadState.status === 'ready' && !groupHasErrors))
  const showReviewSubmitCta =
    reviewReady || currentStep?.kind === 'review' || currentStep?.kind === 'confirm'

  const saveCurrentMatch = useCallback(async () => {
    if (!currentMatch || !matchCanSave || parsedHome === undefined || parsedAway === undefined) return false
    setSavingMatch(true)
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
      setNotice('Pick saved')
      return true
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
    userId
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
    const groupIndex = findStepIndex('group')
    if (groupIndex > fromIndex) {
      setCurrentStepIndex(groupIndex)
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
      setNotice('This match is locked. Moving to the next incomplete pick.')
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

  async function handleGroupContinue() {
    if (groupOutcomes.loadState.status !== 'ready') {
      goNextStep()
      return
    }
    if (groupLocked) {
      setNotice('Group outcomes are locked. Continuing.')
      goNextStep()
      return
    }
    if (groupHasErrors) {
      setNotice('Complete all group outcomes fields before continuing.')
      return
    }
    await groupOutcomes.save()
    goNextStep()
  }

  async function handleSubmitAll() {
    if (!reviewReady) {
      setNotice('Resolve missing picks or group outcomes before submitting.')
      return
    }
    setSavingFinal(true)
    try {
      if (includeGroupStep && !groupLocked) {
        await groupOutcomes.save()
      }
      await picksState.savePicks(picksState.picks)
      setFinalSaved(true)
      setNotice('All wizard picks submitted')
    } finally {
      setSavingFinal(false)
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
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Picks wizard"
        title="Guided Picks Entry"
        subtitle="Edit all open picks one-by-one, resume any time, then review and confirm."
      >
        <div className="space-y-3">
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
            {includeGroupStep ? (
              <Badge tone={groupLocked ? 'locked' : groupHasErrors ? 'warning' : 'secondary'}>
                Group outcomes {groupLocked ? 'Locked' : groupHasErrors ? 'Incomplete' : 'Ready'}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink to="/play/picks" variant="ghost">
              Exit wizard
            </ButtonLink>
            <Button
              variant="secondary"
              onClick={goToNextIncompleteMatch}
              disabled={missingMatches.length === 0}
            >
              Go to next incomplete
            </Button>
            {showReviewSubmitCta ? (
              <Button variant="secondary" onClick={jumpToReviewStep}>
                Review & submit
              </Button>
            ) : null}
          </div>
          {notice ? <div className="text-xs text-muted-foreground">{notice}</div> : null}
        </div>
      </PageHeroPanel>

      {openMatches.length === 0 ? (
        <Alert tone="info" title="No open matches">
          There are no editable picks right now. You can return later and resume from this wizard.
        </Alert>
      ) : null}

      {currentStep?.kind === 'match' && currentMatch ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Match step</div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {currentMatch.homeTeam.code} vs {currentMatch.awayTeam.code}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentMatch.stage} · Kickoff {formatKickoff(currentMatch.kickoffUtc)} · Locks{' '}
                  {formatKickoff(getLockTime(currentMatch.kickoffUtc).toISOString())}
                </div>
              </div>
              <Badge tone={matchLocked ? 'locked' : 'info'}>
                {matchLocked ? 'Locked' : 'Open'}
              </Badge>
            </div>

            {matchLocked ? (
              <Alert tone="warning" title="Locked">
                This match is locked and cannot be edited. Continue to the next step.
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
                <div className="mt-1 text-sm text-foreground">
                  If score is tied, selecting who advances is mandatory.
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="secondary"
                    data-active={activeMatchDraft.advances === 'HOME' ? 'true' : 'false'}
                    className={activeMatchDraft.advances === 'HOME' ? 'border-primary' : ''}
                    disabled={matchLocked || !requiresAdvances}
                    onClick={() =>
                      setActiveMatchDraft((current) => ({ ...current, advances: 'HOME' }))
                    }
                  >
                    {currentMatch.homeTeam.code} advances
                  </Button>
                  <Button
                    variant="secondary"
                    data-active={activeMatchDraft.advances === 'AWAY' ? 'true' : 'false'}
                    className={activeMatchDraft.advances === 'AWAY' ? 'border-primary' : ''}
                    disabled={matchLocked || !requiresAdvances}
                    onClick={() =>
                      setActiveMatchDraft((current) => ({ ...current, advances: 'AWAY' }))
                    }
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
                Previous step
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
                Save & continue
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {currentStep?.kind === 'group' ? (
        <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Group outcomes step</div>
                <div className="mt-1 text-lg font-semibold text-foreground">Group winners and runners-up</div>
                {groupLockTime ? (
                  <div className="text-xs text-muted-foreground">
                    Locks {formatKickoff(groupLockTime.toISOString())}
                  </div>
                ) : null}
              </div>
              <Badge tone={groupLocked ? 'locked' : 'info'}>
                {groupLocked ? 'Locked' : 'Open'}
              </Badge>
            </div>

            {groupOutcomes.loadState.status === 'loading' ? <Skeleton className="h-40 rounded-2xl" /> : null}
            {groupOutcomes.loadState.status === 'error' ? (
              <Alert tone="danger" title="Unable to load group outcomes">
                {groupOutcomes.loadState.message}
              </Alert>
            ) : null}

            {groupOutcomes.loadState.status === 'ready' ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {groupOutcomes.groupIds.map((groupId) => {
                    const teams = groupTeams[groupId] ?? []
                    const prediction = groupOutcomes.data.groups[groupId] ?? {}
                    const errors = groupErrors[groupId]
                    const secondOptions = teams.filter((team) => team.code !== prediction.first)
                    return (
                      <div key={groupId} className="rounded-xl border border-border/70 bg-bg2 p-3">
                        <div className="mb-2 text-sm font-semibold text-foreground">Group {groupId}</div>
                        <div className="grid gap-2">
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">1st place</div>
                            <select
                              value={prediction.first ?? ''}
                              disabled={groupLocked}
                              onChange={(event) =>
                                groupOutcomes.setGroupPick(groupId, 'first', event.target.value)
                              }
                              className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                            >
                              <option value="">Select team</option>
                              {teams.map((team) => (
                                <option key={`${groupId}-first-${team.code}`} value={team.code}>
                                  {team.code} · {team.name}
                                </option>
                              ))}
                            </select>
                            {errors?.first ? <div className="mt-1 text-xs text-destructive">{errors.first}</div> : null}
                          </div>

                          <div>
                            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">2nd place</div>
                            <select
                              value={prediction.second ?? ''}
                              disabled={groupLocked}
                              onChange={(event) =>
                                groupOutcomes.setGroupPick(groupId, 'second', event.target.value)
                              }
                              className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                            >
                              <option value="">Select team</option>
                              {secondOptions.map((team) => (
                                <option key={`${groupId}-second-${team.code}`} value={team.code}>
                                  {team.code} · {team.name}
                                </option>
                              ))}
                            </select>
                            {errors?.second ? <div className="mt-1 text-xs text-destructive">{errors.second}</div> : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {showBestThirds ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
                      Best-third qualifiers
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Array.from({ length: bestThirdSlots }).map((_, index) => {
                        const selected = groupOutcomes.data.bestThirds[index] ?? ''
                        const usedElsewhere = groupOutcomes.data.bestThirds.filter(
                          (code, codeIndex) => code && codeIndex !== index
                        )
                        return (
                          <div key={`best-third-${index}`} className="rounded-xl border border-border/70 bg-bg2 p-3">
                            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Slot {index + 1}</div>
                            <select
                              value={selected}
                              disabled={groupLocked}
                              onChange={(event) => groupOutcomes.setBestThird(index, event.target.value)}
                              className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                            >
                              <option value="">Select team</option>
                              {allGroupTeams.map((team) => {
                                const disabled = team.code !== selected && usedElsewhere.includes(team.code)
                                return (
                                  <option key={`best-third-opt-${index}-${team.code}`} value={team.code} disabled={disabled}>
                                    {team.code} · {team.name}
                                  </option>
                                )
                              })}
                            </select>
                            {bestThirdErrors[index] ? (
                              <div className="mt-1 text-xs text-destructive">{bestThirdErrors[index]}</div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Previous step
              </Button>
              <Button
                variant="secondary"
                onClick={() => void groupOutcomes.save()}
                disabled={groupLocked || groupHasErrors || groupOutcomes.loadState.status !== 'ready'}
                loading={groupOutcomes.saveStatus === 'saving'}
              >
                Save group outcomes
              </Button>
              <Button onClick={() => void handleGroupContinue()}>
                Continue
              </Button>
            </div>
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

            <div className="grid gap-3 md:grid-cols-2">
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

              <div className="rounded-xl border border-border/70 bg-bg2 p-3">
                <div className="text-sm font-semibold text-foreground">Group outcomes</div>
                {!includeGroupStep ? (
                  <div className="mt-2 text-sm text-muted-foreground">Not applicable for this dataset.</div>
                ) : groupLocked ? (
                  <div className="mt-2 text-sm text-muted-foreground">Locked. Existing values are preserved.</div>
                ) : groupHasErrors ? (
                  <div className="mt-2 text-xs text-destructive">Group outcomes still have validation errors.</div>
                ) : (
                  <div className="mt-2 text-sm text-foreground">Ready for confirm.</div>
                )}
              </div>
            </div>

            {!reviewReady ? (
              <Alert tone="warning" title="Action required">
                Complete missing picks or group outcomes before confirming.
              </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Previous step
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
                This syncs your wizard selections and keeps resume data for future updates.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={reviewReady ? 'success' : 'warning'}>
                {reviewReady ? 'Ready to submit' : 'Resolve issues first'}
              </Badge>
              {finalSaved ? <Badge tone="success">Submitted</Badge> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={goPrevStep}>
                Previous step
              </Button>
              <Button
                onClick={() => void handleSubmitAll()}
                disabled={!reviewReady}
                loading={savingFinal}
              >
                Confirm & submit
              </Button>
              <ButtonLink to="/play/picks" variant="secondary">
                Back to My Picks Hub
              </ButtonLink>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
