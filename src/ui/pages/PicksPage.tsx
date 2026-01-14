import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router-dom'

import LockReminderBanner from '../components/LockReminderBanner'
import { FilterIcon, LockIcon } from '../components/Icons'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '../components/ui/Sheet'
import Skeleton from '../components/ui/Skeleton'
import PageHeader from '../components/ui/PageHeader'
import { fetchScoring } from '../../lib/data'
import {
  getDateKeyInTimeZone,
  getLockTime,
  groupMatchesByDateAndStage,
  isMatchLocked,
  PACIFIC_TIME_ZONE
} from '../../lib/matches'
import { findPick, getPredictedWinner, isPickComplete, upsertPick } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick, PickOutcome, PickWinner } from '../../types/picks'
import type { KnockoutStage, ScoringConfig } from '../../types/scoring'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNow } from '../hooks/useNow'
import { usePicksData } from '../hooks/usePicksData'
import { useViewerId } from '../hooks/useViewerId'
import { cn } from '../lib/utils'

const UPCOMING_TAB_STORAGE_KEY = 'wc-upcoming-tab'

type PicksTab = 'upcoming' | 'results'
type UpcomingTab = 'today' | 'matchday' | 'all'

type DraftPick = {
  homeScore?: number
  awayScore?: number
  outcome?: PickOutcome
  winner?: PickWinner
  decidedBy?: Pick['decidedBy']
}

type MatchdayGroup = {
  dateKey: string
  groups: ReturnType<typeof groupMatchesByDateAndStage>
  matches: Match[]
}

type PickScoreBreakdown = {
  exactPoints: number
  resultPoints: number
  knockoutPoints: number
  totalPoints: number
  exactHit: boolean
}

function resolvePicksTab(value: string | null): PicksTab | null {
  if (value === 'results') return 'results'
  if (value === 'upcoming') return 'upcoming'
  return null
}

function formatKickoff(utcIso: string) {
  const date = new Date(utcIso)
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateHeader(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatLastUpdated(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatPickScore(pick?: Pick) {
  if (!pick) return '—'
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    return `${pick.homeScore}-${pick.awayScore}`
  }
  return '—'
}

function formatOutcomeLabel(match: Match, outcome?: Pick['outcome']) {
  if (!outcome) return '—'
  if (outcome === 'DRAW') return 'Draw'
  const winnerCode = outcome === 'WIN' ? match.homeTeam.code : match.awayTeam.code
  return `${winnerCode} win`
}

function formatKnockoutLabel(match: Match, pick?: Pick) {
  if (match.stage === 'Group') return null
  if (!pick?.winner || !pick.decidedBy) return null
  const winnerCode = pick.winner === 'HOME' ? match.homeTeam.code : match.awayTeam.code
  const decided = pick.decidedBy === 'ET' ? 'AET' : 'Pens'
  return `${winnerCode} ${decided}`
}

function getStatusLabel(status: Match['status']) {
  if (status === 'IN_PLAY') return 'Live'
  if (status === 'FINISHED') return 'Final'
  return 'Upcoming'
}

function getStatusTone(status: Match['status']) {
  if (status === 'IN_PLAY') return 'live'
  if (status === 'FINISHED') return 'final'
  return 'upcoming'
}

type StatusTone = 'upcoming' | 'live' | 'final' | 'locked' | 'alert'

function toBadgeTone(tone: StatusTone) {
  if (tone === 'live') return 'info'
  if (tone === 'final') return 'success'
  if (tone === 'locked') return 'locked'
  if (tone === 'alert') return 'secondary'
  return 'default'
}

function resolveStageConfig(match: Match, scoring: ScoringConfig) {
  if (match.stage === 'Group') return scoring.group
  return scoring.knockout[match.stage as KnockoutStage]
}

function scorePickForMatch(
  match: Match,
  pick: Pick | undefined,
  scoring: ScoringConfig
): PickScoreBreakdown {
  if (!pick || !match.score || match.status !== 'FINISHED') {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, totalPoints: 0, exactHit: false }
  }
  if (!isPickComplete(match, pick)) {
    return { exactPoints: 0, resultPoints: 0, knockoutPoints: 0, totalPoints: 0, exactHit: false }
  }
  const config = resolveStageConfig(match, scoring)
  let exactPoints = 0
  let exactHit = false
  if (typeof pick.homeScore === 'number' && typeof pick.awayScore === 'number') {
    const exact = pick.homeScore === match.score.home && pick.awayScore === match.score.away
    if (exact) {
      exactPoints = config.exactScoreBoth
      exactHit = true
    } else {
      const homeMatch = pick.homeScore === match.score.home
      const awayMatch = pick.awayScore === match.score.away
      if (homeMatch !== awayMatch) {
        exactPoints = config.exactScoreOne
      }
    }
  }

  const actualOutcome =
    match.score.home > match.score.away
      ? 'WIN'
      : match.score.home < match.score.away
        ? 'LOSS'
        : 'DRAW'
  const resultPoints = pick.outcome && pick.outcome === actualOutcome ? config.result : 0

  let knockoutPoints = 0
  if (match.stage !== 'Group' && match.winner && config.knockoutWinner) {
    if (match.decidedBy === 'ET' || match.decidedBy === 'PENS') {
      const predictedWinner = getPredictedWinner(pick)
      if (predictedWinner && predictedWinner === match.winner) {
        knockoutPoints = config.knockoutWinner
      }
    }
  }

  return {
    exactPoints,
    resultPoints,
    knockoutPoints,
    totalPoints: exactPoints + resultPoints + knockoutPoints,
    exactHit
  }
}

function buildMatchdays(
  groups: ReturnType<typeof groupMatchesByDateAndStage>,
  order: 'asc' | 'desc'
): MatchdayGroup[] {
  const byDate = new Map<string, MatchdayGroup>()
  for (const group of groups) {
    const existing = byDate.get(group.dateKey)
    if (existing) {
      existing.groups.push(group)
      existing.matches.push(...group.matches)
      continue
    }
    byDate.set(group.dateKey, {
      dateKey: group.dateKey,
      groups: [group],
      matches: [...group.matches]
    })
  }
  const list = [...byDate.values()]
  list.sort((a, b) => (order === 'asc' ? a.dateKey.localeCompare(b.dateKey) : b.dateKey.localeCompare(a.dateKey)))
  return list
}

function ScoreStepper({
  label,
  value,
  onChange,
  disabled
}: {
  label: string
  value?: number
  onChange: (next: number | undefined) => void
  disabled?: boolean
}) {
  const safeValue = typeof value === 'number' ? value : ''
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-[var(--surface-muted)] px-3 py-2">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange(typeof value === 'number' ? Math.max(0, value - 1) : 0)}
          disabled={disabled}
        >
          -
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={safeValue}
          onChange={(event) => {
            const next = event.target.value === '' ? undefined : Number(event.target.value)
            onChange(Number.isFinite(next) ? next : undefined)
          }}
          className="w-16 text-center"
          disabled={disabled}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onChange(typeof value === 'number' ? Math.min(20, value + 1) : 1)}
          disabled={disabled}
        >
          +
        </Button>
      </div>
    </div>
  )
}

function PickEditorSheet({
  match,
  pick,
  open,
  onOpenChange,
  onSave,
  canSave,
  saveStatus,
  now,
  isMobile
}: {
  match: Match | null
  pick?: Pick
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (draft: DraftPick) => Promise<void> | void
  canSave: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  now: Date
  isMobile: boolean
}) {
  const [draft, setDraft] = useState<DraftPick>({})
  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.focus()
    }
  }, [])

  useEffect(() => {
    if (!match) return
    setDraft({
      homeScore: pick?.homeScore,
      awayScore: pick?.awayScore,
      outcome: pick?.outcome,
      winner: pick?.winner,
      decidedBy: pick?.decidedBy
    })
  }, [match?.id, pick?.awayScore, pick?.decidedBy, pick?.homeScore, pick?.outcome, pick?.winner])

  if (!match) return null

  const locked = isMatchLocked(match.kickoffUtc, now)
  const lockTime = getLockTime(match.kickoffUtc)
  const hasChanges =
    draft.homeScore !== pick?.homeScore ||
    draft.awayScore !== pick?.awayScore ||
    draft.outcome !== pick?.outcome ||
    draft.winner !== pick?.winner ||
    draft.decidedBy !== pick?.decidedBy
  const knockoutValue = draft.winner && draft.decidedBy ? `${draft.winner}_${draft.decidedBy}` : ''

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        onOpenAutoFocus={handleOpenAutoFocus}
        tabIndex={-1}
        style={
          isMobile
            ? undefined
            : {
                top: 'calc(var(--app-header-height, 96px) + 12px)',
                bottom: '12px',
                height: 'auto',
                maxHeight: 'calc(100vh - var(--app-header-height, 96px) - 24px)'
              }
        }
        className={cn(
          'overflow-y-auto',
          isMobile
            ? 'pickEditorSheetMobile rounded-t-2xl'
            : 'dialogTopOffset w-[min(96vw,420px)] max-w-[420px] rounded-l-2xl'
        )}
      >
        <SheetHeader>
          <SheetTitle>Make your pick</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{match.stage}</div>
            <div className="mt-1 text-base font-semibold uppercase tracking-[0.12em] text-foreground">
              {match.homeTeam.code} vs {match.awayTeam.code}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{formatKickoff(match.kickoffUtc)}</span>
              <span className="flex items-center gap-1">
                <LockIcon size={12} />
                {locked ? 'Locked' : `Locks at ${formatLockTime(lockTime)}`}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 1</div>
            <div className="text-sm font-semibold uppercase tracking-[0.12em]">Result</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button
                variant="pill"
                size="sm"
                data-active={draft.outcome === 'WIN' ? 'true' : 'false'}
                onClick={() => setDraft((current) => ({ ...current, outcome: 'WIN' }))}
                disabled={locked}
              >
                {match.homeTeam.code} win
              </Button>
              <Button
                variant="pill"
                size="sm"
                data-active={draft.outcome === 'DRAW' ? 'true' : 'false'}
                onClick={() => setDraft((current) => ({ ...current, outcome: 'DRAW' }))}
                disabled={locked}
              >
                Draw
              </Button>
              <Button
                variant="pill"
                size="sm"
                data-active={draft.outcome === 'LOSS' ? 'true' : 'false'}
                onClick={() => setDraft((current) => ({ ...current, outcome: 'LOSS' }))}
                disabled={locked}
              >
                {match.awayTeam.code} win
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 2</div>
            <div className="text-sm font-semibold uppercase tracking-[0.12em]">Exact score</div>
            <div className="grid gap-2">
              <ScoreStepper
                label={match.homeTeam.code}
                value={draft.homeScore}
                onChange={(next) => setDraft((current) => ({ ...current, homeScore: next }))}
                disabled={locked}
              />
              <ScoreStepper
                label={match.awayTeam.code}
                value={draft.awayScore}
                onChange={(next) => setDraft((current) => ({ ...current, awayScore: next }))}
                disabled={locked}
              />
            </div>
          </div>

          {match.stage !== 'Group' ? (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 3</div>
              <div className="text-sm font-semibold uppercase tracking-[0.12em]">Eventual winner</div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
                value={knockoutValue}
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) {
                    setDraft((current) => ({ ...current, winner: undefined, decidedBy: undefined }))
                    return
                  }
                  const [winner, decidedBy] = value.split('_')
                  setDraft((current) => ({
                    ...current,
                    winner: winner === 'HOME' || winner === 'AWAY' ? winner : undefined,
                    decidedBy: decidedBy === 'ET' || decidedBy === 'PENS' ? decidedBy : undefined
                  }))
                }}
                disabled={locked}
              >
                <option value="">Pick AET/Pens winner</option>
                <option value="HOME_ET">{match.homeTeam.code} win AET</option>
                <option value="AWAY_ET">{match.awayTeam.code} win AET</option>
                <option value="HOME_PENS">{match.homeTeam.code} win Pens</option>
                <option value="AWAY_PENS">{match.awayTeam.code} win Pens</option>
              </select>
              <div className="text-xs text-muted-foreground">
                Knockout scoring uses 90-minute scores. AET/Pens only affect winner points.
              </div>
            </div>
          ) : null}

          {locked ? (
            <div className="rounded-lg border border-[var(--border-warning)] bg-[var(--banner-accent)] p-3 text-xs text-foreground">
              Picks lock 30 minutes before kickoff. This match is locked.
            </div>
          ) : null}
        </div>
        <SheetFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {!canSave
              ? 'Local only'
              : saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : saveStatus === 'error'
                    ? 'Save failed'
                    : 'Ready'}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="ghost"
              onClick={() =>
                setDraft({
                  homeScore: undefined,
                  awayScore: undefined,
                  outcome: undefined,
                  winner: undefined,
                  decidedBy: undefined
                })
              }
              disabled={locked}
            >
              Clear
            </Button>
            <Button
              size="sm"
              variant="pill"
              onClick={() => onSave(draft)}
              disabled={!hasChanges || locked}
              loading={saveStatus === 'saving'}
              data-active="true"
            >
              Save pick
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default function PicksPage() {
  const { state, picks, updatePicks, savePicks, saveStatus, canSave } = usePicksData()
  const userId = useViewerId()
  const now = useNow({ tickMs: 60000 })
  const isMobile = useMediaQuery('(max-width: 900px)')
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = resolvePicksTab(searchParams.get('tab'))
  const [activeTab, setActiveTab] = useState<PicksTab>(() => tabParam ?? 'upcoming')
  const [upcomingTab, setUpcomingTab] = useState<UpcomingTab>('matchday')
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)
  const [view, setView] = useState<'group' | 'knockout' | null>(null)
  const [groupFilter, setGroupFilter] = useState('all')
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const [activeUpcomingDateKey, setActiveUpcomingDateKey] = useState<string | null>(null)
  const [expandedResultMatches, setExpandedResultMatches] = useState<Set<string>>(() => new Set())
  const [scoring, setScoring] = useState<ScoringConfig | null>(null)
  const [scoringError, setScoringError] = useState<string | null>(null)

  useEffect(() => {
    if (!tabParam) return
    setActiveTab(tabParam)
  }, [tabParam])

  useEffect(() => {
    const currentTab = searchParams.get('tab')
    if (!currentTab && activeTab === 'upcoming') return
    if (currentTab === activeTab) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', activeTab)
    setSearchParams(nextParams, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(UPCOMING_TAB_STORAGE_KEY)
    if (stored === 'today' || stored === 'matchday' || stored === 'all') {
      setUpcomingTab(stored)
      return
    }
    setUpcomingTab(isMobile ? 'today' : 'matchday')
  }, [isMobile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(UPCOMING_TAB_STORAGE_KEY, upcomingTab)
  }, [upcomingTab])

  useEffect(() => {
    let canceled = false
    fetchScoring()
      .then((data) => {
        if (!canceled) {
          setScoring(data)
          setScoringError(null)
        }
      })
      .catch((error) => {
        if (canceled) return
        const message = error instanceof Error ? error.message : 'Unable to load scoring.'
        setScoring(null)
        setScoringError(message)
      })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'ready') return
    const matchParam = searchParams.get('match')
    if (!matchParam) return
    const match = state.matches.find((item) => item.id === matchParam)
    if (match) {
      setActiveMatchId(matchParam)
      setActiveTab('upcoming')
      setUpcomingTab('matchday')
      setActiveUpcomingDateKey(getDateKeyInTimeZone(match.kickoffUtc))
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('match')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams, state])

  const groupStageComplete = useMemo(() => {
    if (state.status !== 'ready') return false
    const groupMatches = state.matches.filter((match) => match.stage === 'Group')
    if (groupMatches.length === 0) return false
    return groupMatches.every((match) => match.status === 'FINISHED')
  }, [state])

  const knockoutHasResults = useMemo(() => {
    if (state.status !== 'ready') return false
    return state.matches.some((match) => match.stage !== 'Group' && match.status === 'FINISHED')
  }, [state])

  const canShowKnockout = groupStageComplete

  useEffect(() => {
    if (view !== null) return
    if (state.status !== 'ready') return
    const defaultView =
      activeTab === 'results'
        ? canShowKnockout && knockoutHasResults
          ? 'knockout'
          : 'group'
        : canShowKnockout
          ? 'knockout'
          : 'group'
    setView(defaultView)
  }, [activeTab, canShowKnockout, knockoutHasResults, state.status, view])

  useEffect(() => {
    if (!canShowKnockout && view === 'knockout') setView('group')
  }, [canShowKnockout, view])

  const activeView = canShowKnockout ? view ?? 'group' : 'group'

  const upcomingGroups = useMemo(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.matches.filter(
      (match) => match.stage === 'Group' && match.status !== 'FINISHED'
    )
    const groups = new Set(
      groupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
    return [...groups].sort()
  }, [state])

  const resultGroups = useMemo(() => {
    if (state.status !== 'ready') return []
    const groupMatches = state.matches.filter(
      (match) => match.stage === 'Group' && match.status === 'FINISHED'
    )
    const groups = new Set(
      groupMatches.map((match) => match.group).filter((group): group is string => !!group)
    )
    return [...groups].sort()
  }, [state])

  const availableGroups = activeTab === 'results' ? resultGroups : upcomingGroups

  useEffect(() => {
    if (activeView !== 'group' && groupFilter !== 'all') {
      setGroupFilter('all')
    }
  }, [activeView, groupFilter])

  useEffect(() => {
    if (groupFilter !== 'all' && !availableGroups.includes(groupFilter)) {
      setGroupFilter('all')
    }
  }, [availableGroups, groupFilter])

  const baseUpcomingMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches.filter((match) => match.status !== 'FINISHED')
  }, [state])

  const baseResultMatches = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.matches.filter((match) => match.status === 'FINISHED')
  }, [state])

  const upcomingMatches = useMemo(() => {
    let matches = baseUpcomingMatches
    matches =
      activeView === 'knockout'
        ? matches.filter((match) => match.stage !== 'Group')
        : matches.filter((match) => match.stage === 'Group')
    if (activeView === 'group' && groupFilter !== 'all') {
      matches = matches.filter((match) => match.group === groupFilter)
    }
    return matches.sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())
  }, [activeView, baseUpcomingMatches, groupFilter])

  const resultsMatches = useMemo(() => {
    let matches = baseResultMatches
    matches =
      activeView === 'knockout'
        ? matches.filter((match) => match.stage !== 'Group')
        : matches.filter((match) => match.stage === 'Group')
    if (activeView === 'group' && groupFilter !== 'all') {
      matches = matches.filter((match) => match.group === groupFilter)
    }
    return matches.sort((a, b) => new Date(b.kickoffUtc).getTime() - new Date(a.kickoffUtc).getTime())
  }, [activeView, baseResultMatches, groupFilter])

  const todayKey = useMemo(() => getDateKeyInTimeZone(new Date().toISOString()), [])
  const todayMatches = useMemo(
    () => upcomingMatches.filter((match) => getDateKeyInTimeZone(match.kickoffUtc) === todayKey),
    [todayKey, upcomingMatches]
  )

  const groupedUpcomingMatches = useMemo(
    () => groupMatchesByDateAndStage(upcomingMatches),
    [upcomingMatches]
  )
  const upcomingMatchdays = useMemo(
    () => buildMatchdays(groupedUpcomingMatches, 'asc'),
    [groupedUpcomingMatches]
  )
  const upcomingMatchdayKeys = useMemo(() => upcomingMatchdays.map((day) => day.dateKey), [upcomingMatchdays])
  const defaultUpcomingDateKey = useMemo(
    () => (upcomingMatchdays.length > 0 ? upcomingMatchdays[0].dateKey : null),
    [upcomingMatchdays]
  )

  useEffect(() => {
    if (!defaultUpcomingDateKey) {
      setActiveUpcomingDateKey(null)
      return
    }
    setActiveUpcomingDateKey((current) =>
      current && upcomingMatchdayKeys.includes(current) ? current : defaultUpcomingDateKey
    )
  }, [defaultUpcomingDateKey, upcomingMatchdayKeys])

  const activeUpcomingMatchday = useMemo(() => {
    if (upcomingMatchdays.length === 0) return null
    const targetKey = activeUpcomingDateKey ?? upcomingMatchdays[0].dateKey
    return upcomingMatchdays.find((day) => day.dateKey === targetKey) ?? upcomingMatchdays[0]
  }, [activeUpcomingDateKey, upcomingMatchdays])

  const groupedResultMatches = useMemo(() => groupMatchesByDateAndStage(resultsMatches), [resultsMatches])
  const resultMatchdays = useMemo(
    () => buildMatchdays(groupedResultMatches, 'desc'),
    [groupedResultMatches]
  )

  const resultDateKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const match of resultsMatches) {
      keys.add(getDateKeyInTimeZone(match.kickoffUtc))
    }
    return [...keys].sort((a, b) => b.localeCompare(a))
  }, [resultsMatches])

  useEffect(() => {
    if (resultDateKeys.length === 0) {
      setActiveDateKey(null)
      return
    }
    setActiveDateKey((current) => (current && resultDateKeys.includes(current) ? current : resultDateKeys[0]))
  }, [resultDateKeys])

  const resultMatchdayKeys = useMemo(() => resultMatchdays.map((day) => day.dateKey), [resultMatchdays])
  const resultSignature = resultMatchdayKeys.join('|')
  const showFilters = canShowKnockout || (activeView === 'group' && availableGroups.length > 1)

  const activeResultMatchday = useMemo(() => {
    if (resultMatchdays.length === 0) return null
    const targetKey = activeDateKey ?? resultMatchdays[0].dateKey
    return resultMatchdays.find((day) => day.dateKey === targetKey) ?? resultMatchdays[0]
  }, [activeDateKey, resultMatchdays])

  useEffect(() => {
    setExpandedResultMatches(new Set())
  }, [activeDateKey, resultSignature])

  const activeMatch = useMemo(() => {
    if (state.status !== 'ready' || !activeMatchId) return null
    return state.matches.find((match) => match.id === activeMatchId) ?? null
  }, [activeMatchId, state])

  const activePick = useMemo(() => {
    if (!activeMatch) return undefined
    return findPick(picks, activeMatch.id, userId)
  }, [activeMatch, picks, userId])

  const upcomingNavItems = useMemo(() => {
    return upcomingMatchdays.map((matchday) => {
      const missingCount = matchday.matches.reduce((count, match) => {
        const pick = findPick(picks, match.id, userId)
        return count + (isPickComplete(match, pick) ? 0 : 1)
      }, 0)
      return {
        dateKey: matchday.dateKey,
        label: formatDateHeader(matchday.dateKey),
        matchCount: matchday.matches.length,
        missingCount
      }
    })
  }, [picks, upcomingMatchdays, userId])

  const resultNavItems = useMemo(() => {
    return resultMatchdays.map((matchday) => {
      const points =
        scoring && matchday.matches.length > 0
          ? matchday.matches.reduce((sum, match) => {
              const pick = findPick(picks, match.id, userId)
              return sum + scorePickForMatch(match, pick, scoring).totalPoints
            }, 0)
          : null
      return {
        dateKey: matchday.dateKey,
        label: formatDateHeader(matchday.dateKey),
        matchCount: matchday.matches.length,
        points
      }
    })
  }, [picks, resultMatchdays, scoring, userId])

  const showUpcomingMatchdayNav =
    activeTab === 'upcoming' && upcomingTab === 'matchday' && upcomingNavItems.length > 1
  const showResultsMatchdayNav = activeTab === 'results' && resultNavItems.length > 1

  const activeUpcomingSummary = useMemo(() => {
    if (!activeUpcomingMatchday) return null
    const missingCount = activeUpcomingMatchday.matches.reduce((count, match) => {
      const pick = findPick(picks, match.id, userId)
      return count + (isPickComplete(match, pick) ? 0 : 1)
    }, 0)
    const matchCountLabel = `${activeUpcomingMatchday.matches.length} match${
      activeUpcomingMatchday.matches.length === 1 ? '' : 'es'
    }`
    return { missingCount, matchCountLabel }
  }, [activeUpcomingMatchday, picks, userId])

  const activeResultSummary = useMemo(() => {
    if (!activeResultMatchday || !scoring) return null
    const matchCountLabel = `${activeResultMatchday.matches.length} match${
      activeResultMatchday.matches.length === 1 ? '' : 'es'
    }`
    const points = activeResultMatchday.matches.reduce((sum, match) => {
      const pick = findPick(picks, match.id, userId)
      return sum + scorePickForMatch(match, pick, scoring).totalPoints
    }, 0)
    const pointsLabel = `${points} pt${points === 1 ? '' : 's'} earned`
    return { matchCountLabel, pointsLabel }
  }, [activeResultMatchday, picks, scoring, userId])

  const handleSavePick = useCallback(
    async (draft: DraftPick) => {
      if (!activeMatch) return
      const next = upsertPick(picks, {
        matchId: activeMatch.id,
        userId,
        homeScore: draft.homeScore,
        awayScore: draft.awayScore,
        outcome: draft.outcome,
        winner: draft.winner,
        decidedBy: draft.decidedBy
      })
      updatePicks(next)
      if (canSave) {
        await savePicks(next)
      }
      setActiveMatchId(null)
    },
    [activeMatch, canSave, picks, savePicks, updatePicks, userId]
  )

  function toggleResultMatchRow(matchId: string) {
    setExpandedResultMatches((current) => {
      const next = new Set(current)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        next.add(matchId)
      }
      return next
    })
  }

  function renderPickSummary(match: Match, pick?: Pick) {
    if (!pick) return <span className="pickMissing">No pick</span>
    const score = formatPickScore(pick)
    const outcome = formatOutcomeLabel(match, pick.outcome)
    const knockout = formatKnockoutLabel(match, pick)

    return (
      <div className="resultsPickSummary">
        <span>Exact: {score}</span>
        <span>Outcome: {outcome}</span>
        {knockout ? <span>KO: {knockout}</span> : null}
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="stack">
        <PageHeader
          kicker="Matchday Picks"
          title="Picks"
          subtitle="Set your picks before lock and review finished results."
        />
        <div className="stack">
          <Skeleton height={18} />
          <Skeleton height={18} width="70%" />
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="stack">
        <PageHeader
          kicker="Matchday Picks"
          title="Picks"
          subtitle="Set your picks before lock and review finished results."
        />
        <Alert tone="danger">{state.message}</Alert>
      </div>
    )
  }

  const lockBanner =
    activeTab === 'upcoming' ? (
      <LockReminderBanner
        matches={upcomingMatches}
        picks={picks}
        userId={userId}
        onOpenMatch={(matchId) => {
          const match =
            state.status === 'ready'
              ? state.matches.find((item) => item.id === matchId)
              : null
          if (match) {
            setUpcomingTab('matchday')
            setActiveUpcomingDateKey(getDateKeyInTimeZone(match.kickoffUtc))
          }
          setActiveMatchId(matchId)
        }}
      />
    ) : null

  return (
    <div className="stack">
      <PageHeader
        kicker="Matchday Picks"
        title="Picks"
        subtitle="Set picks ahead of lock, then review your points once matches finish."
        actions={
          state.status === 'ready' ? (
            <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
              <div className="uppercase tracking-[0.2em]">Match data</div>
              <div className="text-sm font-semibold text-foreground">
                {formatLastUpdated(state.lastUpdated)}
              </div>
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 min-[901px]:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 min-[901px]:sticky min-[901px]:top-24 min-[901px]:self-start">
          {showUpcomingMatchdayNav ? (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Matchday</div>
              <div className="text-lg font-semibold text-foreground">Choose a matchday</div>
              <div className="mt-4 grid gap-2">
                {upcomingNavItems.map((item) => {
                  const isActive = item.dateKey === activeUpcomingDateKey
                  const missingTone = item.missingCount > 0 ? 'alert' : 'final'
                  return (
                    <button
                      key={item.dateKey}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition',
                        isActive
                          ? 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground'
                          : 'border-border/60 bg-[var(--surface-muted)] text-muted-foreground hover:border-border'
                      )}
                      onClick={() => setActiveUpcomingDateKey(item.dateKey)}
                      aria-pressed={isActive}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">{item.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.matchCount} matches
                        </span>
                      </div>
                      <Badge tone={toBadgeTone(missingTone)}>
                        {item.missingCount > 0 ? `${item.missingCount} missing` : 'All picked'}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            </Card>
          ) : null}

          {showResultsMatchdayNav ? (
            <Card className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Matchday</div>
              <div className="text-lg font-semibold text-foreground">Result days</div>
              <div className="mt-4 grid gap-2">
                {resultNavItems.map((item) => {
                  const isActive = item.dateKey === activeDateKey
                  const pointsLabel = item.points === null ? 'Scoring...' : `${item.points} pts`
                  const pointsTone = item.points && item.points > 0 ? 'final' : 'upcoming'
                  return (
                    <button
                      key={item.dateKey}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition',
                        isActive
                          ? 'border-[var(--border-accent)] bg-[var(--accent-soft)] text-foreground'
                          : 'border-border/60 bg-[var(--surface-muted)] text-muted-foreground hover:border-border'
                      )}
                      onClick={() => setActiveDateKey(item.dateKey)}
                      aria-pressed={isActive}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-foreground">{item.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.matchCount} matches
                        </span>
                      </div>
                      <Badge tone={toBadgeTone(pointsTone)}>{pointsLabel}</Badge>
                    </button>
                  )
                })}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="stack">
          {lockBanner}
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Picks view</div>
                <div className="text-lg font-semibold text-foreground">Upcoming and results</div>
                <div className="text-sm text-muted-foreground">
                  Switch between matchday picks and finished results.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="pill"
                  data-active={activeTab === 'upcoming' ? 'true' : 'false'}
                  onClick={() => setActiveTab('upcoming')}
                >
                  Upcoming
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="pill"
                  data-active={activeTab === 'results' ? 'true' : 'false'}
                  onClick={() => setActiveTab('results')}
                >
                  Results
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {activeTab === 'upcoming' ? 'Upcoming' : 'Results'}
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {activeTab === 'upcoming' ? 'Make your picks' : 'Matchday breakdowns'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {activeTab === 'upcoming'
                    ? `${upcomingMatches.length} matches waiting.`
                    : 'Review your points once matches finish.'}
                </div>
              </div>
              {activeTab === 'upcoming' ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="pill"
                    data-active={upcomingTab === 'today' ? 'true' : 'false'}
                    onClick={() => setUpcomingTab('today')}
                  >
                    Today
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="pill"
                    data-active={upcomingTab === 'matchday' ? 'true' : 'false'}
                    onClick={() => setUpcomingTab('matchday')}
                  >
                    Matchday
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="pill"
                    data-active={upcomingTab === 'all' ? 'true' : 'false'}
                    onClick={() => setUpcomingTab('all')}
                  >
                    All
                  </Button>
                </div>
              ) : null}
            </div>

            {showFilters ? (
              <div className="mt-4 rounded-lg border border-border/60 bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <FilterIcon className="h-4 w-4" />
                  Filters
                </div>
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Stage</div>
                    {canShowKnockout ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="pill"
                          data-active={activeView === 'group' ? 'true' : 'false'}
                          onClick={() => setView('group')}
                        >
                          Group stage
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="pill"
                          data-active={activeView === 'knockout' ? 'true' : 'false'}
                          onClick={() => setView('knockout')}
                        >
                          Knockout
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        Knockout {activeTab === 'results' ? 'results' : 'matches'} unlock after group stage.
                      </div>
                    )}
                  </div>
                  {activeView === 'group' && availableGroups.length > 1 ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Group filter
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="pill"
                          data-active={groupFilter === 'all' ? 'true' : 'false'}
                          onClick={() => setGroupFilter('all')}
                        >
                          All groups
                        </Button>
                        {availableGroups.map((group) => (
                          <Button
                            key={group}
                            type="button"
                            size="sm"
                            variant="pill"
                            data-active={groupFilter === group ? 'true' : 'false'}
                            onClick={() => setGroupFilter(group)}
                          >
                            Group {group}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {activeTab === 'upcoming' ? (
            <div className="stack">
              {upcomingTab === 'today' ? (
                todayMatches.length === 0 ? (
                  <Card className="p-4 text-sm text-muted-foreground">
                    No matches locking today.
                  </Card>
                ) : (
                  <div className="list">
                    {todayMatches.map((match, index) => {
                      const pick = findPick(picks, match.id, userId)
                      const locked = isMatchLocked(match.kickoffUtc, now)
                      const missing = !isPickComplete(match, pick)
                      const rowTone = match.status === 'IN_PLAY' ? 'live' : 'upcoming'
                      const statusTone = locked ? 'locked' : rowTone
                      const statusLabel = locked ? 'Locked' : rowTone === 'live' ? 'Live' : 'Upcoming'
                      const pickTone = missing ? (locked ? 'locked' : 'alert') : 'final'
                      const pickLabel = missing ? 'Missing' : 'Picked'
                      const actionLabel = missing ? (locked ? 'View match' : 'Make pick') : 'Review pick'
                      const rowStyle = { '--row-index': index } as CSSProperties
                      const knockoutLabel = formatKnockoutLabel(match, pick)

                      return (
                        <div
                          key={match.id}
                          className={cn('matchRow', missing && !locked ? 'matchRowMissing' : null)}
                          style={rowStyle}
                          data-status={rowTone}
                          data-locked={locked ? 'true' : 'false'}
                        >
                          <div className="matchInfo">
                            <div className="matchTeams">
                              <div className="team">
                                <span className="teamCode">{match.homeTeam.code}</span>
                                <span className="teamName">{match.homeTeam.name}</span>
                              </div>
                              <div className="vs">vs</div>
                              <div className="team">
                                <span className="teamCode">{match.awayTeam.code}</span>
                                <span className="teamName">{match.awayTeam.name}</span>
                              </div>
                            </div>
                            <div className="matchSub">
                              <div className="matchKickoff">{formatKickoff(match.kickoffUtc)}</div>
                              <div className="statusRow">
                                <Badge tone={toBadgeTone(statusTone)}>{statusLabel}</Badge>
                                <Badge tone={toBadgeTone(pickTone)}>{pickLabel}</Badge>
                              </div>
                            </div>
                            <div className="matchSummary">
                              <span className="matchSummaryLabel">Your pick</span>
                              {missing ? (
                                <span className="matchSummaryMissing">Pick needed</span>
                              ) : (
                                <div className="matchSummaryValues">
                                  <span>{formatPickScore(pick)}</span>
                                  <span>{formatOutcomeLabel(match, pick?.outcome)}</span>
                                  {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="matchActions">
                            <button
                              type="button"
                              className="matchRowToggle"
                              onClick={() => setActiveMatchId(match.id)}
                            >
                              <span className="matchRowToggleLabel">{actionLabel}</span>
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {locked
                                ? `Locked since ${formatLockTime(getLockTime(match.kickoffUtc))}`
                                : `Locks at ${formatLockTime(getLockTime(match.kickoffUtc))}`}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : null}

              {upcomingTab === 'matchday' ? (
                !activeUpcomingMatchday ? (
                  <Card className="p-4 text-sm text-muted-foreground">No upcoming matches.</Card>
                ) : (
                  <Card
                    as="section"
                    key={activeUpcomingMatchday.dateKey}
                    className="matchdayCard"
                    id={`matchday-${activeUpcomingMatchday.dateKey}`}
                  >
                    <div className="matchdayHeader">
                      <div className="groupTitle">
                        <span className="groupDate">{formatDateHeader(activeUpcomingMatchday.dateKey)}</span>
                        <span className="groupStage">Matchday</span>
                      </div>
                      <span className="toggleMeta">
                        {activeUpcomingSummary
                          ? `${activeUpcomingSummary.matchCountLabel} · ${activeUpcomingSummary.missingCount} missing`
                          : `${activeUpcomingMatchday.matches.length} matches`}
                      </span>
                    </div>

                    <div className="matchdayPanel">
                      {activeUpcomingMatchday.groups.map((group) => {
                        const stageKey = `${activeUpcomingMatchday.dateKey}-${group.stage}`
                        const stageLabel = `${group.matches.length} match${
                          group.matches.length === 1 ? '' : 'es'
                        }`
                        return (
                          <div key={stageKey} className="matchdayStage">
                            <div className="matchdayStageHeader">
                              <div className="matchdayStageTitle">{group.stage}</div>
                              <div className="matchdayStageMeta">{stageLabel}</div>
                            </div>
                            <div className="list">
                              {group.matches.map((match, index) => {
                                const pick = findPick(picks, match.id, userId)
                                const locked = isMatchLocked(match.kickoffUtc, now)
                                const missing = !isPickComplete(match, pick)
                                const rowTone = match.status === 'IN_PLAY' ? 'live' : 'upcoming'
                                const statusTone = locked ? 'locked' : rowTone
                                const statusLabel = locked ? 'Locked' : rowTone === 'live' ? 'Live' : 'Upcoming'
                                const pickTone = missing ? (locked ? 'locked' : 'alert') : 'final'
                                const pickLabel = missing ? 'Missing' : 'Picked'
                                const actionLabel = missing ? (locked ? 'View match' : 'Make pick') : 'Review pick'
                                const rowStyle = { '--row-index': index } as CSSProperties
                                const knockoutLabel = formatKnockoutLabel(match, pick)

                                return (
                                  <div
                                    key={match.id}
                                    className={cn('matchRow', missing && !locked ? 'matchRowMissing' : null)}
                                    style={rowStyle}
                                    data-status={rowTone}
                                    data-locked={locked ? 'true' : 'false'}
                                  >
                                    <div className="matchInfo">
                                      <div className="matchTeams">
                                        <div className="team">
                                          <span className="teamCode">{match.homeTeam.code}</span>
                                          <span className="teamName">{match.homeTeam.name}</span>
                                        </div>
                                        <div className="vs">vs</div>
                                        <div className="team">
                                          <span className="teamCode">{match.awayTeam.code}</span>
                                          <span className="teamName">{match.awayTeam.name}</span>
                                        </div>
                                      </div>
                                      <div className="matchSub">
                                        <div className="matchKickoff">{formatKickoff(match.kickoffUtc)}</div>
                                        <div className="statusRow">
                                          <Badge tone={toBadgeTone(statusTone)}>{statusLabel}</Badge>
                                          <Badge tone={toBadgeTone(pickTone)}>{pickLabel}</Badge>
                                        </div>
                                      </div>
                                      <div className="matchSummary">
                                        <span className="matchSummaryLabel">Your pick</span>
                                        {missing ? (
                                          <span className="matchSummaryMissing">Pick needed</span>
                                        ) : (
                                          <div className="matchSummaryValues">
                                            <span>{formatPickScore(pick)}</span>
                                            <span>{formatOutcomeLabel(match, pick?.outcome)}</span>
                                            {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="matchActions">
                                      <button
                                        type="button"
                                        className="matchRowToggle"
                                        onClick={() => setActiveMatchId(match.id)}
                                      >
                                        <span className="matchRowToggleLabel">{actionLabel}</span>
                                      </button>
                                      <div className="text-xs text-muted-foreground">
                                        {locked
                                          ? `Locked since ${formatLockTime(getLockTime(match.kickoffUtc))}`
                                          : `Locks at ${formatLockTime(getLockTime(match.kickoffUtc))}`}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )
              ) : null}

              {upcomingTab === 'all' ? (
                upcomingMatches.length === 0 ? (
                  <Card className="p-4 text-sm text-muted-foreground">No upcoming matches.</Card>
                ) : (
                  <div className="list">
                    {upcomingMatches.map((match, index) => {
                      const pick = findPick(picks, match.id, userId)
                      const locked = isMatchLocked(match.kickoffUtc, now)
                      const missing = !isPickComplete(match, pick)
                      const rowTone = match.status === 'IN_PLAY' ? 'live' : 'upcoming'
                      const statusTone = locked ? 'locked' : rowTone
                      const statusLabel = locked ? 'Locked' : rowTone === 'live' ? 'Live' : 'Upcoming'
                      const pickTone = missing ? (locked ? 'locked' : 'alert') : 'final'
                      const pickLabel = missing ? 'Missing' : 'Picked'
                      const actionLabel = missing ? (locked ? 'View match' : 'Make pick') : 'Review pick'
                      const rowStyle = { '--row-index': index } as CSSProperties
                      const knockoutLabel = formatKnockoutLabel(match, pick)

                      return (
                        <div
                          key={match.id}
                          className={cn('matchRow', missing && !locked ? 'matchRowMissing' : null)}
                          style={rowStyle}
                          data-status={rowTone}
                          data-locked={locked ? 'true' : 'false'}
                        >
                          <div className="matchInfo">
                            <div className="matchTeams">
                              <div className="team">
                                <span className="teamCode">{match.homeTeam.code}</span>
                                <span className="teamName">{match.homeTeam.name}</span>
                              </div>
                              <div className="vs">vs</div>
                              <div className="team">
                                <span className="teamCode">{match.awayTeam.code}</span>
                                <span className="teamName">{match.awayTeam.name}</span>
                              </div>
                            </div>
                            <div className="matchSub">
                              <div className="matchKickoff">{formatKickoff(match.kickoffUtc)}</div>
                              <div className="statusRow">
                                <Badge tone={toBadgeTone(statusTone)}>{statusLabel}</Badge>
                                <Badge tone={toBadgeTone(pickTone)}>{pickLabel}</Badge>
                              </div>
                            </div>
                            <div className="matchSummary">
                              <span className="matchSummaryLabel">Your pick</span>
                              {missing ? (
                                <span className="matchSummaryMissing">Pick needed</span>
                              ) : (
                                <div className="matchSummaryValues">
                                  <span>{formatPickScore(pick)}</span>
                                  <span>{formatOutcomeLabel(match, pick?.outcome)}</span>
                                  {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="matchActions">
                            <button
                              type="button"
                              className="matchRowToggle"
                              onClick={() => setActiveMatchId(match.id)}
                            >
                              <span className="matchRowToggleLabel">{actionLabel}</span>
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {locked
                                ? `Locked since ${formatLockTime(getLockTime(match.kickoffUtc))}`
                                : `Locks at ${formatLockTime(getLockTime(match.kickoffUtc))}`}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {activeTab === 'results' ? (
            <div className="stack">
              {scoringError ? <Alert tone="danger">{scoringError}</Alert> : null}
              {!scoring && !scoringError ? (
                <div className="stack">
                  <Skeleton height={18} />
                  <Skeleton height={18} width="70%" />
                </div>
              ) : null}

              {scoring ? (
                activeResultMatchday ? (
                  <Card
                    as="section"
                    key={activeResultMatchday.dateKey}
                    className="matchdayCard"
                    id={`matchday-${activeResultMatchday.dateKey}`}
                  >
                    <div className="matchdayHeader">
                      <div className="groupTitle">
                        <span className="groupDate">{formatDateHeader(activeResultMatchday.dateKey)}</span>
                        <span className="groupStage">Matchday</span>
                      </div>
                      <span className="toggleMeta">
                        {activeResultSummary
                          ? `${activeResultSummary.matchCountLabel} · ${activeResultSummary.pointsLabel}`
                          : `${activeResultMatchday.matches.length} matches`}
                      </span>
                    </div>

                    <div className="matchdayPanel">
                      {activeResultMatchday.groups.map((group) => {
                        const stageKey = `${activeResultMatchday.dateKey}-${group.stage}`
                        const stageLabel = `${group.matches.length} match${
                          group.matches.length === 1 ? '' : 'es'
                        }`
                        return (
                          <div key={stageKey} className="matchdayStage">
                            <div className="matchdayStageHeader">
                              <div className="matchdayStageTitle">{group.stage}</div>
                              <div className="matchdayStageMeta">{stageLabel}</div>
                            </div>
                            <div className="list">
                              {group.matches.map((match, index) => {
                                const currentPick = findPick(picks, match.id, userId)
                                const showScore =
                                  match.status === 'FINISHED' &&
                                  typeof match.score?.home === 'number' &&
                                  typeof match.score?.away === 'number'
                                const rowStyle = { '--row-index': index } as CSSProperties
                                const statusLabel = getStatusLabel(match.status)
                                const statusTone = getStatusTone(match.status)
                                const isExpandedRow = expandedResultMatches.has(match.id)
                                const pickScore = scorePickForMatch(match, currentPick, scoring)
                                const knockoutLabel = formatKnockoutLabel(match, currentPick)

                                return (
                                  <div
                                    key={match.id}
                                    className="matchRow"
                                    style={rowStyle}
                                    data-status={statusTone}
                                    data-expanded={isExpandedRow ? 'true' : 'false'}
                                  >
                                    <div className="matchInfo">
                                      <div className="matchTeams">
                                        <div className="team">
                                          <span className="teamCode">{match.homeTeam.code}</span>
                                          <span className="teamName">{match.homeTeam.name}</span>
                                        </div>
                                        <div className="vs">vs</div>
                                        <div className="team">
                                          <span className="teamCode">{match.awayTeam.code}</span>
                                          <span className="teamName">{match.awayTeam.name}</span>
                                        </div>
                                      </div>
                                      <div className="matchSub">
                                        <div className="matchKickoff">{formatKickoff(match.kickoffUtc)}</div>
                                        <div className="statusRow">
                                          <Badge tone={toBadgeTone(statusTone)}>{statusLabel}</Badge>
                                          {showScore ? (
                                            <span className="scoreTag">
                                              {match.score!.home}-{match.score!.away}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="matchSummary">
                                        <span className="matchSummaryLabel">Your pick</span>
                                        {currentPick ? (
                                          <div className="matchSummaryValues">
                                            <span>{formatPickScore(currentPick)}</span>
                                            <span>{formatOutcomeLabel(match, currentPick.outcome)}</span>
                                            {knockoutLabel ? <span>{knockoutLabel}</span> : null}
                                          </div>
                                        ) : (
                                          <span className="matchSummaryMissing">No pick</span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="matchActions">
                                      <button
                                        type="button"
                                        className="matchRowToggle"
                                        data-collapsed={isExpandedRow ? 'false' : 'true'}
                                        aria-expanded={isExpandedRow}
                                        onClick={() => toggleResultMatchRow(match.id)}
                                      >
                                        <span className="toggleChevron" aria-hidden="true">
                                          ▾
                                        </span>
                                        <span className="matchRowToggleLabel">
                                          {isExpandedRow ? 'Hide details' : 'View details'}
                                        </span>
                                      </button>
                                      {isExpandedRow ? (
                                        <div className="matchRowDetails">
                                          <div
                                            className={
                                              currentPick
                                                ? 'resultsPickRow'
                                                : 'resultsPickRow resultsPickMissing'
                                            }
                                          >
                                            <div className="resultsPickName">Your pick</div>
                                            {renderPickSummary(match, currentPick)}
                                          </div>
                                          <div className="pointsBreakdown">
                                            <span className="pointsChip">Exact {pickScore.exactPoints}</span>
                                            <span className="pointsChip">Outcome {pickScore.resultPoints}</span>
                                            <span className="pointsChip">KO {pickScore.knockoutPoints}</span>
                                            <span className="pointsChip pointsChipTotal">
                                              {pickScore.totalPoints} pts
                                            </span>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                ) : (
                  <Card className="p-4 text-sm text-muted-foreground">No results yet.</Card>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <PickEditorSheet
        match={activeMatch}
        pick={activePick}
        open={Boolean(activeMatchId)}
        onOpenChange={(open) => {
          if (!open) setActiveMatchId(null)
        }}
        onSave={handleSavePick}
        canSave={canSave}
        saveStatus={saveStatus}
        now={now}
        isMobile={isMobile}
      />
    </div>
  )
}
