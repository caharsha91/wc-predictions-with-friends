import { type ReactNode, useMemo } from 'react'

import { findPick, isPickComplete } from '../../../lib/picks'
import { isStrictGroupRanking } from '../../../lib/groupRanking'
import type { Match } from '../../../types/matches'
import { CompanionButtonLink } from '../../components/mobile/CompanionSafeActions'
import PageHeaderV2 from '../../components/v2/PageHeaderV2'
import PageShellV2 from '../../components/v2/PageShellV2'
import SectionCardV2 from '../../components/v2/SectionCardV2'
import SnapshotStamp from '../../components/v2/SnapshotStamp'
import StatusTagV2 from '../../components/v2/StatusTagV2'
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

function StatusCopy({ children }: { children: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{children}</div>
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

  const groupSummary = useMemo(() => {
    let groupsDone = 0

    for (const groupId of groupStage.groupIds) {
      const group = groupStage.data.groups[groupId]
      const teamCodes = groupTeams[groupId] ?? []
      if (teamCodes.length > 0 && isStrictGroupRanking(group?.ranking, teamCodes)) groupsDone += 1
    }

    const bestThirdDone = groupStage.data.bestThirds.filter((code) => Boolean(String(code ?? '').trim())).length
    const pending = Math.max(0, groupStage.groupIds.length - groupsDone) + Math.max(0, BEST_THIRD_TARGET - bestThirdDone)

    return {
      groupsDone,
      groupsTotal: groupStage.groupIds.length,
      bestThirdDone,
      pending
    }
  }, [groupStage.data.bestThirds, groupStage.data.groups, groupStage.groupIds, groupTeams])

  const drawConfirmed =
    phaseState.tournamentPhase === 'KO_OPEN' ||
    phaseState.tournamentPhase === 'KO_LOCKED' ||
    phaseState.tournamentPhase === 'FINAL'

  const knockoutTotal = knockoutData.totalMatches
  const knockoutComplete = knockoutData.completeMatches

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
            <div className="v2-type-kicker text-muted-foreground">Pending picks</div>
            <div className="v2-type-body-sm font-semibold text-foreground">{pendingMatchEdits}</div>
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
          <CompanionButtonLink to="/m/picks" size="sm" variant="primary">
            {pendingMatchEdits > 0 ? 'Continue picks' : 'Open picks'}
          </CompanionButtonLink>
          <CompanionButtonLink to="/m/leaderboard" size="sm" variant="secondary">
            Open league
          </CompanionButtonLink>
        </div>
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Group Stage</div>
          <StatusTagV2 tone={groupSummary.pending > 0 ? 'warning' : 'success'}>
            {groupSummary.pending > 0 ? `${groupSummary.pending} pending` : 'Complete'}
          </StatusTagV2>
        </div>

        {groupStage.loadState.status === 'loading' ? (
          <StatusCopy>Syncing group stage status…</StatusCopy>
        ) : groupStage.loadState.status === 'error' ? (
          <StatusCopy>{groupStage.loadState.message}</StatusCopy>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Groups</div>
              <div className="font-semibold text-foreground">{groupSummary.groupsDone}/{groupSummary.groupsTotal}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Best 3rd</div>
              <div className="font-semibold text-foreground">{groupSummary.bestThirdDone}/{BEST_THIRD_TARGET}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Status</div>
              <div className="font-semibold text-foreground">{groupStage.isLocked ? 'Locked' : 'Open'}</div>
            </div>
          </div>
        )}

        <StatusCopy>Group stage actions are available on web.</StatusCopy>
      </SectionCardV2>

      <SectionCardV2 tone="panel" density="none" className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="v2-type-kicker">Knockout Bracket</div>
          <StatusTagV2 tone={!drawConfirmed ? 'warning' : phaseState.lockFlags.bracketEditable ? 'info' : 'locked'}>
            {!drawConfirmed ? 'Not open' : phaseState.lockFlags.bracketEditable ? 'Open' : 'Locked'}
          </StatusTagV2>
        </div>

        {knockoutData.loadState.status === 'loading' ? (
          <StatusCopy>Syncing knockout bracket status…</StatusCopy>
        ) : knockoutData.loadState.status === 'error' ? (
          <StatusCopy>{knockoutData.loadState.message}</StatusCopy>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Picks</div>
              <div className="font-semibold text-foreground">{knockoutComplete}/{knockoutTotal}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Draw</div>
              <div className="font-semibold text-foreground">{drawConfirmed ? 'Confirmed' : 'Pending'}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              <div className="text-muted-foreground">Phase</div>
              <div className="font-semibold text-foreground">{phaseState.tournamentPhase}</div>
            </div>
          </div>
        )}

        <StatusCopy>Knockout bracket actions are available on web.</StatusCopy>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionPicksPage() {
  return (
    <CompanionPageFrame kicker="Companion" title="Picks">
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
