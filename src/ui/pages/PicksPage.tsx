import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchScoring } from '../../lib/data'
import { getDateKeyInTimeZone, getGroupOutcomesLockTime, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete, upsertPick } from '../../lib/picks'
import type { GroupPrediction } from '../../types/bracket'
import type { Match } from '../../types/matches'
import type { Pick, PickAdvances } from '../../types/picks'
import { Alert } from '../components/ui/Alert'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import LockReminderBanner from '../components/LockReminderBanner'
import PageHeader from '../components/ui/PageHeader'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { useGroupOutcomesData } from '../hooks/useGroupOutcomesData'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useViewerId } from '../hooks/useViewerId'
import { cn } from '../lib/utils'

type DraftPick = {
  homeScore: string
  awayScore: string
  advances: '' | PickAdvances
}

const DEFAULT_BEST_THIRD_SLOTS = 8
const LIST_PAGE_SIZE = 10
const HISTORY_PAGE_SIZE = 16

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

function MatchList({
  matches,
  picks,
  userId,
  now,
  emptyMessage,
  onOpenEditor,
  actionLabel,
  pageSize = LIST_PAGE_SIZE
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
  const userId = useViewerId()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const picksState = usePicksData()
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftPick>({ homeScore: '', awayScore: '', advances: '' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [savingPick, setSavingPick] = useState(false)
  const [showBestThirds, setShowBestThirds] = useState(false)
  const [historyMatchday, setHistoryMatchday] = useState<'ALL' | string>('ALL')
  const [historyPage, setHistoryPage] = useState(1)

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

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupOutcomes = useGroupOutcomesData(matches)

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

  const historyMatches = useMemo(
    () =>
      matches
        .filter((match) => new Date(match.kickoffUtc).getTime() < now.getTime())
        .sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime()),
    [matches, now]
  )

  const historyMatchdays = useMemo(
    () =>
      [...new Set(historyMatches.map((match) => getDateKeyInTimeZone(match.kickoffUtc)))].sort((a, b) =>
        b.localeCompare(a)
      ),
    [historyMatches]
  )

  useEffect(() => {
    if (historyMatchday === 'ALL') return
    if (historyMatchdays.includes(historyMatchday)) return
    setHistoryMatchday('ALL')
  }, [historyMatchday, historyMatchdays])

  const filteredHistory = useMemo(() => {
    if (historyMatchday === 'ALL') return historyMatches
    return historyMatches.filter((match) => getDateKeyInTimeZone(match.kickoffUtc) === historyMatchday)
  }, [historyMatchday, historyMatches])

  useEffect(() => {
    setHistoryPage(1)
  }, [historyMatchday, filteredHistory.length])

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

  function openNextActionEditor() {
    if (!quickEditTarget) return
    openEditor(quickEditTarget.id)
  }

  function openWizard() {
    navigate('/picks/wizard')
  }

  const groupLockTime = useMemo(() => getGroupOutcomesLockTime(matches), [matches])
  const groupLocked = groupLockTime ? now.getTime() >= groupLockTime.getTime() : false
  const bestThirdSlots = Math.max(DEFAULT_BEST_THIRD_SLOTS, groupOutcomes.data.bestThirds.length)
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
  const groupErrorCount =
    Object.keys(groupErrors).length + (showBestThirds ? bestThirdErrors.filter(Boolean).length : 0)
  const groupSummaryTone =
    groupOutcomes.loadState.status === 'loading'
      ? 'secondary'
      : groupOutcomes.loadState.status === 'error'
        ? 'danger'
        : groupLocked
          ? 'locked'
          : groupHasErrors
            ? 'warning'
            : 'success'

  const progressTotal = openMatches.length
  const progressDone = completedOpenMatches.length
  const progressPct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0
  const wizardLabel = pendingOpenMatches.length > 0 ? 'Continue picks wizard' : 'Start picks wizard'
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE))
  const safeHistoryPage = Math.min(historyPage, historyTotalPages)
  const historyStartIndex = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE
  const visibleHistory = filteredHistory.slice(historyStartIndex, historyStartIndex + HISTORY_PAGE_SIZE)

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
      <PageHeader
        title="My Picks Hub"
        subtitle="Default view shows only what needs action now. Locked, completed, and history stay behind tabs."
        kicker="Action-first"
        actions={
          <div className="text-right text-xs text-muted-foreground">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">
              {formatKickoff(picksState.state.lastUpdated)}
            </div>
          </div>
        }
      />

      <LockReminderBanner
        matches={matches}
        picks={picksState.picks}
        userId={userId}
        onOpenMatch={(matchId) => openEditor(matchId)}
      />

      <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Next action</div>
              <div className="mt-1 text-xl font-semibold text-foreground">
                {pendingOpenMatches.length > 0
                  ? `${pendingOpenMatches.length} open picks need submission`
                  : openMatches.length > 0
                    ? 'Open picks complete for now'
                    : 'No open picks yet'}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Use the wizard flow for step-by-step picks. Quick edit remains available for one-off fixes.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Open picks progress</span>
                <span>
                  {progressDone}/{progressTotal}
                </span>
              </div>
              <div className="h-2 rounded-full bg-bg2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{progressPct}% complete</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={pendingOpenMatches.length > 0 ? 'warning' : 'success'}>
                Needs action {pendingOpenMatches.length}
              </Badge>
              <Badge tone="secondary">Open now {openMatches.length}</Badge>
              <Badge tone="secondary">Locked {lockedMatches.length}</Badge>
              <Badge tone={groupSummaryTone}>
                Group outcomes{' '}
                {groupOutcomes.loadState.status === 'loading'
                  ? 'Loading'
                  : groupOutcomes.loadState.status === 'error'
                    ? 'Error'
                    : groupLocked
                      ? 'Locked'
                      : groupHasErrors
                        ? `Missing ${groupErrorCount}`
                        : 'Ready'}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={openWizard}>{wizardLabel}</Button>
              <Button variant="secondary" onClick={openNextActionEditor} disabled={!quickEditTarget}>
                Quick edit next match
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-bg2 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rules</div>
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
      </Card>

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          <Accordion type="multiple" className="space-y-3">
            <AccordionItem value="open-now">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  Open now
                  <Badge tone={pendingOpenMatches.length > 0 ? 'warning' : 'secondary'}>
                    {pendingOpenMatches.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Unsubmitted and unlocked picks.
                  </div>
                  <Button size="sm" onClick={openWizard}>
                    {wizardLabel}
                  </Button>
                </div>
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
                <span className="flex items-center gap-2">
                  Completed (open)
                  <Badge tone="success">{completedOpenMatches.length}</Badge>
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
                <span className="flex items-center gap-2">
                  Locked / waiting
                  <Badge tone="locked">{lockedMatches.length}</Badge>
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
          </Accordion>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Past matchdays</div>
                <div className="text-lg font-semibold text-foreground">History is opt-in</div>
              </div>
              <div className="w-full max-w-[240px]">
                <select
                  className="w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground"
                  value={historyMatchday}
                  onChange={(event) => setHistoryMatchday(event.target.value)}
                >
                  <option value="ALL">All past matchdays</option>
                  {historyMatchdays.map((matchday) => (
                    <option key={matchday} value={matchday}>
                      {matchday}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Table>
              <thead>
                <tr>
                  <th>Matchday</th>
                  <th>Match</th>
                  <th>Stage</th>
                  <th>Kickoff</th>
                  <th>Your pick</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((match) => {
                  const pick = findPick(picksState.picks, match.id, userId)
                  return (
                    <tr key={`history-${match.id}`}>
                      <td>{getDateKeyInTimeZone(match.kickoffUtc)}</td>
                      <td>
                        {match.homeTeam.code} vs {match.awayTeam.code}
                      </td>
                      <td>{match.stage}</td>
                      <td>{formatKickoff(match.kickoffUtc)}</td>
                      <td className={cn(!pick ? 'text-muted-foreground' : '')}>
                        {pick
                          ? `${pick.homeScore ?? '-'}-${pick.awayScore ?? '-'}${pick.advances ? ` (${pick.advances})` : ''}`
                          : 'No pick'}
                      </td>
                    </tr>
                  )
                })}
                {visibleHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-sm text-muted-foreground">
                      No history for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
            {filteredHistory.length > 0 ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Showing {historyStartIndex + 1}-{Math.min(historyStartIndex + HISTORY_PAGE_SIZE, filteredHistory.length)} of{' '}
                  {filteredHistory.length}
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

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          className={cn(
            isDesktop ? 'w-[92vw] max-w-xl' : 'pickEditorSheetMobile rounded-t-2xl'
          )}
        >
          <SheetHeader>
            <SheetTitle>Quick edit</SheetTitle>
            <SheetDescription>Wizard flow is available from the Start/Continue entry point.</SheetDescription>
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
