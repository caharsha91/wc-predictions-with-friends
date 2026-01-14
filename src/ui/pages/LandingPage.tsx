import { useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/Badge'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { fetchMatches, fetchScoring } from '../../lib/data'
import { getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete, loadLocalPicks } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { ScoringConfig } from '../../types/scoring'
import { useNow } from '../hooks/useNow'
import { useViewerId } from '../hooks/useViewerId'

type ScoreRange = { min: number; max: number }

type UpcomingLock = {
  match: Match
  lockTime: Date
}

function getRange(values: number[]): ScoreRange | null {
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

function formatRange(range: ScoreRange | null): string | null {
  if (!range) return null
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`
}

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function LandingPage() {
  const [scoring, setScoring] = useState<ScoringConfig | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [localPicks, setLocalPicks] = useState<Pick[]>([])
  const userId = useViewerId()
  const now = useNow({ tickMs: 60000 })

  useEffect(() => {
    setLocalPicks(loadLocalPicks(userId))
  }, [userId])

  useEffect(() => {
    let canceled = false
    fetchScoring()
      .then((data) => {
        if (!canceled) setScoring(data)
      })
      .catch(() => {
        if (!canceled) setScoring(null)
      })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    let canceled = false
    fetchMatches()
      .then((matchesFile) => {
        if (!canceled) setMatches(matchesFile.matches)
      })
      .catch(() => {
        if (!canceled) setMatches([])
      })
    return () => {
      canceled = true
    }
  }, [])

  const scoringSummary = useMemo(() => {
    if (!scoring) return null
    const knockoutStages = Object.values(scoring.knockout)
    const knockoutExact = formatRange(getRange(knockoutStages.map((stage) => stage.exactScoreBoth)))
    const knockoutOne = formatRange(getRange(knockoutStages.map((stage) => stage.exactScoreOne)))
    const knockoutResult = formatRange(getRange(knockoutStages.map((stage) => stage.result)))
    const knockoutWinner = formatRange(
      getRange(
        knockoutStages
          .map((stage) => stage.knockoutWinner)
          .filter((value): value is number => typeof value === 'number')
      )
    )
    const bracketKnockout = formatRange(getRange(Object.values(scoring.bracket.knockout)))
    return {
      group: scoring.group,
      knockout: {
        exact: knockoutExact,
        one: knockoutOne,
        result: knockoutResult,
        winner: knockoutWinner
      },
      bracket: {
        groupQualifiers: scoring.bracket.groupQualifiers,
        thirdPlaceQualifiers: scoring.bracket.thirdPlaceQualifiers,
        knockout: bracketKnockout
      }
    }
  }, [scoring])

  const formatValue = (value: number | string | null | undefined) => value ?? '—'
  const formatPoints = (value: number | string | null | undefined) => {
    const resolved = formatValue(value)
    return resolved === '—' ? '—' : `${resolved} pts`
  }

  const upcomingMatches = useMemo(
    () => matches.filter((match) => match.status !== 'FINISHED'),
    [matches]
  )

  const upcomingSorted = useMemo(() => {
    return [...upcomingMatches].sort(
      (a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime()
    )
  }, [upcomingMatches])

  const picksByMatch = useMemo(() => {
    return new Map(localPicks.map((pick) => [pick.matchId, pick]))
  }, [localPicks])

  const missingMatches = useMemo(() => {
    return upcomingSorted.filter((match) => {
      const pick = picksByMatch.get(match.id)
      return !isPickComplete(match, pick)
    })
  }, [picksByMatch, upcomingSorted])

  const missingUnlocked = useMemo(
    () => missingMatches.filter((match) => !isMatchLocked(match.kickoffUtc, now)),
    [missingMatches, now]
  )

  const lockedMissing = missingMatches.filter((match) => isMatchLocked(match.kickoffUtc, now))

  const nextLock = useMemo<UpcomingLock | null>(() => {
    const upcoming = upcomingSorted
      .map((match) => ({ match, lockTime: getLockTime(match.kickoffUtc) }))
      .filter((entry) => entry.lockTime.getTime() > now.getTime())
      .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())
    return upcoming[0] ?? null
  }, [now, upcomingSorted])

  const nextActionable = missingUnlocked[0] ?? null
  const totalUpcoming = upcomingSorted.length
  const missingCount = missingMatches.length
  const completeCount = Math.max(0, totalUpcoming - missingCount)
  const progress =
    totalUpcoming > 0 ? Math.round((completeCount / totalUpcoming) * 100) : 0
  const hasUpcoming = totalUpcoming > 0

  const statusTone = !hasUpcoming ? 'info' : missingCount === 0 ? 'success' : 'warning'
  const statusLabel =
    !hasUpcoming
      ? 'No upcoming'
      : missingUnlocked.length > 0
        ? `${missingUnlocked.length} picks due`
        : missingCount === 0
          ? 'All picks in'
          : `${lockedMissing.length} locked`

  const primaryCta = nextActionable
    ? {
        label: 'Make next pick',
        to: `/picks?match=${nextActionable.id}`
      }
    : nextLock
      ? {
          label: missingCount === 0 ? 'Review next lock' : 'Review upcoming',
          to: `/picks?match=${nextLock.match.id}`
        }
      : {
          label: 'View results',
          to: '/picks?tab=results'
        }
  const primaryCtaVariant = nextActionable ? 'pillSecondary' : 'pill'

  const nextLockPick = nextLock ? findPick(localPicks, nextLock.match.id, userId) : undefined
  const nextLockPicked = nextLock ? isPickComplete(nextLock.match, nextLockPick) : false

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-7 shadow-card">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone="info">Invite-only</Badge>
            <span>Daily leaderboard refresh • Offline results pipeline</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Prediction control room
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Set your picks before lock, build your bracket once groups wrap, and let the points
            roll up overnight.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink to={primaryCta.to} variant={primaryCtaVariant} size="sm">
              {primaryCta.label}
            </ButtonLink>
            <ButtonLink to="/picks?tab=results" variant="pill" size="sm">
              Check results
            </ButtonLink>
            <ButtonLink to="/bracket" variant="pill" size="sm">
              Bracket
            </ButtonLink>
            <ButtonLink to="/leaderboard" variant="pill" size="sm">
              Leaderboard
            </ButtonLink>
          </div>
        </Card>

        <Card className="rounded-3xl border border-border/60 bg-card p-6 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Your status
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {!hasUpcoming
                  ? 'No upcoming matches'
                  : missingCount === 0
                    ? 'All picks submitted'
                    : missingUnlocked.length > 0
                      ? 'Picks due before lock'
                      : 'Some picks locked'}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {hasUpcoming
                  ? `${completeCount} of ${totalUpcoming} upcoming picks complete.`
                  : 'Check results or leaderboard for the latest standings.'}
              </div>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] px-4 py-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Pick progress</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-[var(--surface-muted)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            {nextLock ? (
              <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] px-4 py-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Next lock</span>
                  <Badge tone={nextLockPicked ? 'success' : 'warning'}>
                    {nextLockPicked ? 'Picked' : 'Missing'}
                  </Badge>
                </div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {nextLock.match.homeTeam.code} vs {nextLock.match.awayTeam.code}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {nextLock.match.stage} • Locks at {formatLockTime(nextLock.lockTime)}
                </div>
                <div className="mt-3">
                  <ButtonLink to={`/picks?match=${nextLock.match.id}`} variant="pill" size="sm">
                    {nextLockPicked ? 'Review this match' : 'Pick this match'}
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
                No upcoming matches. Jump to Picks → Results for the latest points.
              </div>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 1</div>
          <div className="mt-2 text-base font-semibold text-foreground">Join the league</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with Google. An admin needs to add your email before picks unlock.
          </p>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 2</div>
          <div className="mt-2 text-base font-semibold text-foreground">Pick before lock</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Use Picks to set results and exact scores. Picks lock 30 minutes before kickoff.
          </p>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 3</div>
          <div className="mt-2 text-base font-semibold text-foreground">Build your bracket</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick group qualifiers, best thirds, and knockout winners once the group stage wraps.
            Bracket picks lock before the knockout kickoff.
          </p>
        </Card>
        <Card className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 4</div>
          <div className="mt-2 text-base font-semibold text-foreground">Track your points</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Results show your match breakdowns. Leaderboard refreshes daily from the offline run.
          </p>
        </Card>
      </section>

      <Card className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Scoring snapshot
            </div>
            <div className="mt-2 text-lg font-semibold text-foreground">
              Points that swing the leaderboard
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick reference for what matters most when you set a pick.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">Scoring overview</div>
        </div>
        {scoringSummary ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-[var(--surface-muted)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Group stage
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Exact score</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.group.exactScoreBoth)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">One team exact</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.group.exactScoreOne)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Result</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.group.result)}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-[var(--surface-muted)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Knockout
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Exact score</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.knockout.exact)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">One team exact</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.knockout.one)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Result</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.knockout.result)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Winner</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.knockout.winner)}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-[var(--surface-muted)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bracket</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Qualifiers</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.bracket.groupQualifiers)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Best third</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.bracket.thirdPlaceQualifiers)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Knockout</span>
                  <span className="font-semibold text-foreground">
                    {formatPoints(scoringSummary.bracket.knockout)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border/60 bg-[var(--surface-muted)] p-4 text-sm text-muted-foreground">
            Exact scores win big. Results and knockout winners add extra points.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className="normal-case tracking-normal text-[11px] text-muted-foreground">
            Extra time + pens only affect winner picks.
          </Badge>
          <Badge className="normal-case tracking-normal text-[11px] text-muted-foreground">
            Leaderboard refreshes daily from the offline run.
          </Badge>
        </div>
      </Card>
    </div>
  )
}
