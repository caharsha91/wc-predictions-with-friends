import { type ReactNode, useMemo } from 'react'

import { findPick, isPickComplete } from '../../../lib/picks'
import { isStrictGroupRanking } from '../../../lib/groupRanking'
import type { Match } from '../../../types/matches'
import { CompanionButtonLink } from '../../components/mobile/CompanionSafeActions'
import PageHeaderV2 from '../../components/v2/PageHeaderV2'
import PageShellV2 from '../../components/v2/PageShellV2'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import SnapshotStamp from '../../components/v2/SnapshotStamp'
import { useTournamentPhaseState } from '../../context/TournamentPhaseContext'
import { useBracketKnockoutData } from '../../hooks/useBracketKnockoutData'
import { useGroupStageData } from '../../hooks/useGroupStageData'
import { useNow } from '../../hooks/useNow'
import { usePicksData } from '../../hooks/usePicksData'
import { usePublishedSnapshot } from '../../hooks/usePublishedSnapshot'
import { useViewerId } from '../../hooks/useViewerId'
import { computeMatchTimelineModel } from '../../lib/matchTimeline'
import CompanionLeaderboardContent from './CompanionLeaderboardContent'
import CompanionPredictionsContent from './CompanionPredictionsContent'

const BEST_THIRD_TARGET = 8

function CompanionPageFrame({
  title,
  kicker,
  children
}: {
  title: string
  kicker: string
  children: ReactNode
}) {
  return (
    <PageShellV2 className="space-y-3">
      <PageHeaderV2 kicker={kicker} title={title} />
      {children}
    </PageShellV2>
  )
}

function buildGroupTeams(matches: Match[]): Record<string, string[]> {
  const groups = new Map<string, Set<string>>()
  for (const match of matches) {
    if (match.stage !== 'Group' || !match.group) continue
    const existing = groups.get(match.group) ?? new Set<string>()
    existing.add(match.homeTeam.code)
    existing.add(match.awayTeam.code)
    groups.set(match.group, existing)
  }

  const grouped: Record<string, string[]> = {}
  for (const [groupId, teamSet] of groups.entries()) {
    grouped[groupId] = [...teamSet.values()].sort((left, right) => left.localeCompare(right))
  }
  return grouped
}

function formatKickoff(utcIso: string | null): string {
  if (!utcIso) return 'No upcoming kickoff'
  const value = new Date(utcIso)
  if (!Number.isFinite(value.getTime())) return 'No upcoming kickoff'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(value)
}

export function CompanionHomePage() {
  const now = useNow({ tickMs: 60_000 })
  const phaseState = useTournamentPhaseState()
  const viewerId = useViewerId()
  const picksState = usePicksData()
  const snapshot = usePublishedSnapshot()
  const knockoutData = useBracketKnockoutData()

  const matches = picksState.state.status === 'ready' ? picksState.state.matches : []
  const groupStage = useGroupStageData(matches)
  const groupTeams = useMemo(() => buildGroupTeams(matches), [matches])

  const timeline = useMemo(
    () =>
      computeMatchTimelineModel(matches, now.toISOString(), {
        matchPicksEditable: phaseState.lockFlags.matchPicksEditable
      }),
    [matches, now, phaseState.lockFlags.matchPicksEditable]
  )

  const editableMatches = useMemo(
    () => timeline.upcoming.filter((item) => item.editable),
    [timeline.upcoming]
  )

  const pendingMatchEdits = useMemo(() => {
    return editableMatches.reduce((count, item) => {
      const pick = findPick(picksState.picks, item.match.id, viewerId)
      return count + (isPickComplete(item.match, pick) ? 0 : 1)
    }, 0)
  }, [editableMatches, picksState.picks, viewerId])

  const groupPending = useMemo(() => {
    if (!phaseState.lockFlags.groupEditable || groupStage.isLocked) return 0

    let groupsDone = 0
    for (const groupId of groupStage.groupIds) {
      const group = groupStage.data.groups[groupId]
      const teamCodes = groupTeams[groupId] ?? []
      if (teamCodes.length > 0 && isStrictGroupRanking(group?.ranking, teamCodes)) groupsDone += 1
    }

    const bestThirdDone = groupStage.data.bestThirds.filter((code) => Boolean(String(code ?? '').trim())).length
    return Math.max(0, groupStage.groupIds.length - groupsDone) + Math.max(0, BEST_THIRD_TARGET - bestThirdDone)
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds, groupStage.isLocked, groupTeams, phaseState.lockFlags.groupEditable])

  const knockoutPending = phaseState.lockFlags.bracketEditable
    ? Math.max(0, knockoutData.totalMatches - knockoutData.completeMatches)
    : 0

  const totalPending = pendingMatchEdits + groupPending + knockoutPending
  const nextKickoff = timeline.upcoming.find((item) => item.normalizedStatus === 'scheduled')?.match.kickoffUtc ?? null
  const liveCount = timeline.upcoming.filter((item) => item.normalizedStatus === 'live').length

  const snapshotTimestamp =
    snapshot.state.status === 'ready'
      ? snapshot.state.snapshotTimestamp
      : picksState.state.status === 'ready'
        ? picksState.state.lastUpdated
        : null

  return (
    <CompanionPageFrame kicker="Companion" title="Home">
      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <SnapshotStamp timestamp={snapshotTimestamp} prefix="Snapshot: " />
          <span>{phaseState.tournamentPhase}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Pending</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{totalPending}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Live</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{liveCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Editable</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{editableMatches.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2">
            <div className="v2-type-kicker text-muted-foreground">Next lock</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{formatKickoff(nextKickoff)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <CompanionButtonLink to="/m/predictions" size="sm" variant="primary">
            {totalPending > 0 ? 'Continue edits' : 'Open predictions'}
          </CompanionButtonLink>
          <CompanionButtonLink to="/m/leaderboard" size="sm" variant="secondary">
            Open league
          </CompanionButtonLink>
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionPredictionsPage() {
  return (
    <CompanionPageFrame kicker="Companion" title="Predictions">
      <CompanionPredictionsContent />
    </CompanionPageFrame>
  )
}

export function CompanionLeaderboardPage() {
  return (
    <CompanionPageFrame kicker="Companion" title="League">
      <CompanionLeaderboardContent />
    </CompanionPageFrame>
  )
}
