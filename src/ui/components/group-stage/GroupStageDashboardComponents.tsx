import { useEffect, useState, type DragEvent, type ReactNode } from 'react'

import type { GroupPrediction } from '../../../types/bracket'
import type { BestThirdStatus, GroupPlacementStatus } from '../../../lib/groupStageSnapshot'
import type { Team } from '../../../types/matches'
import { cn } from '../../lib/utils'
import { SNAPSHOT_METADATA_PREFIX } from '../../lib/pageStatusCopy'
import { Button, ButtonLink } from '../ui/Button'
import InlineStateHintV2 from '../v2/InlineStateHintV2'
import RowShellV2 from '../v2/RowShellV2'
import SideListPanelV2 from '../v2/SideListPanelV2'
import StatusTagV2 from '../v2/StatusTagV2'
import TeamIdentityInlineV2 from '../v2/TeamIdentityInlineV2'
import V2Card from '../v2/V2Card'
export type { LeaderboardCardRow } from '../v2/LeaderboardSideListV2'
export { LeaderboardCardCurated, RightRailSticky } from '../v2/LeaderboardSideListV2'

export type GroupStageDenseRow = {
  groupId: string
  teams: Team[]
  prediction: GroupPrediction
  ranking: string[]
  rankingComplete: boolean
  complete: boolean
  actualTopTwo: string[]
  finishedCount: number
  totalCount: number
  firstResult: GroupPlacementStatus
  secondResult: GroupPlacementStatus
  rowResult: GroupPlacementStatus
}

export type BestThirdGroupTile = {
  groupId: string
  teamCode: string
  teamName: string
  selected: boolean
  disabled: boolean
  blockedReason: 'not-ready' | 'cap' | null
  status: BestThirdStatus
  animateSelection: boolean
}

type DashboardToolbarProps = {
  playCenterPath: string
  leaderboardPath: string
  picksLastSavedLabel: string
  scoringSnapshotLabel: string
}

export function DashboardToolbar({
  playCenterPath,
  leaderboardPath,
  picksLastSavedLabel,
  scoringSnapshotLabel
}: DashboardToolbarProps) {
  return (
    <V2Card tone="panel" className="rounded-xl px-4 py-2">
      <div className="flex h-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight text-foreground">Group Stage</div>
          <div className="v2-type-caption truncate">Latest snapshot updates publish daily.</div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 p-1">
          <ButtonLink to={playCenterPath} size="sm" variant="pill" className="v2-action-compact">
            Play Center
          </ButtonLink>
          <ButtonLink to={leaderboardPath} size="sm" variant="pillSecondary" className="v2-action-compact">
            Leaderboard
          </ButtonLink>
        </div>

        <div className="v2-type-caption min-w-0 max-w-[34ch] items-center gap-2">
          <span className="truncate whitespace-nowrap">Saved: {picksLastSavedLabel}</span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span className="truncate whitespace-nowrap">{SNAPSHOT_METADATA_PREFIX}{scoringSnapshotLabel}</span>
        </div>
      </div>
    </V2Card>
  )
}

type StatusBarProps = {
  groupsDone: number
  groupsTotal: number
  bestThirdDone: number
  bestThirdTotal: number
  closesLabel: string
  stateLabel: string
}

export function StatusBar({
  groupsDone,
  groupsTotal,
  bestThirdDone,
  bestThirdTotal,
  closesLabel,
  stateLabel
}: StatusBarProps) {
  return (
    <V2Card tone="panel" className="group-stage-v2-status rounded-xl px-3 py-1.5">
      <div className="flex h-full w-full flex-wrap items-center justify-end gap-2.5 overflow-hidden">
        <StatusTagV2 tone={groupsDone === groupsTotal && groupsTotal > 0 ? 'success' : 'warning'}>
          Groups {groupsDone}/{groupsTotal}
        </StatusTagV2>
        <StatusTagV2 tone={bestThirdDone === bestThirdTotal ? 'success' : 'warning'}>
          Best Thirds {bestThirdDone}/{bestThirdTotal}
        </StatusTagV2>
        <StatusTagV2 tone="info">
          Closes {closesLabel}
        </StatusTagV2>
        <StatusTagV2 tone={stateLabel === 'Final' ? 'success' : 'secondary'}>
          State {stateLabel}
        </StatusTagV2>
      </div>
    </V2Card>
  )
}

function resolveRowDelta({
  row,
  first,
  second,
  groupQualifierPoints
}: {
  row: GroupStageDenseRow
  first: string
  second: string
  groupQualifierPoints: number
}): number {
  if (row.complete) {
    let earned = 0
    if (first && first === row.actualTopTwo[0]) earned += groupQualifierPoints
    if (second && second === row.actualTopTwo[1]) earned += groupQualifierPoints
    return earned
  }

  let potential = 0
  if (first) potential += groupQualifierPoints
  if (second) potential += groupQualifierPoints
  return potential
}

function resolveDeltaTag(row: GroupStageDenseRow, delta: number): { tone: 'success' | 'secondary'; label: string } {
  if (row.complete) {
    return {
      tone: delta > 0 ? 'success' : 'secondary',
      label: `Scored +${delta}`
    }
  }

  return {
    tone: 'secondary',
    label: `Max +${delta}`
  }
}

type GroupPicksDenseTableProps = {
  rows: GroupStageDenseRow[]
  groupsDone: number
  groupsTotal: number
  isReadOnly: boolean
  groupQualifierPoints: number
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'locked'
  savingRowGroupId: string | null
  savedRowGroupId: string | null
  onRankingReorder: (row: GroupStageDenseRow, ranking: string[]) => void
}

function slotContextLabel(index: number): string {
  if (index === 0 || index === 1) return 'Qualified'
  if (index === 2) return 'Third candidate'
  return 'Eliminated'
}

function reorderRanking(ranking: string[], sourceCode: string, targetCode: string): string[] {
  if (sourceCode === targetCode) return ranking
  const sourceIndex = ranking.indexOf(sourceCode)
  const targetIndex = ranking.indexOf(targetCode)
  if (sourceIndex < 0 || targetIndex < 0) return ranking

  const next = [...ranking]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function GroupPicksDenseTable({
  rows,
  groupsDone,
  groupsTotal,
  isReadOnly,
  groupQualifierPoints,
  saveStatus,
  savingRowGroupId,
  savedRowGroupId,
  onRankingReorder
}: GroupPicksDenseTableProps) {
  const [dragging, setDragging] = useState<{ groupId: string; code: string } | null>(null)
  const [dragOver, setDragOver] = useState<{ groupId: string; code: string } | null>(null)

  const clearDragState = () => {
    setDragging(null)
    setDragOver(null)
  }

  const isDragDisabled = isReadOnly || saveStatus === 'saving'

  function handleDragStart(event: DragEvent<HTMLDivElement>, row: GroupStageDenseRow, code: string) {
    if (isDragDisabled) return
    setDragging({ groupId: row.groupId, code })
    setDragOver({ groupId: row.groupId, code })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${row.groupId}:${code}`)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, row: GroupStageDenseRow, code: string) {
    if (!dragging || dragging.groupId !== row.groupId) return
    event.preventDefault()
    if (dragOver?.groupId === row.groupId && dragOver.code === code) return
    setDragOver({ groupId: row.groupId, code })
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, row: GroupStageDenseRow, code: string) {
    event.preventDefault()
    const payload = event.dataTransfer.getData('text/plain')
    const [payloadGroupId, payloadCode] = payload.split(':')
    const sourceCode =
      dragging && dragging.groupId === row.groupId ? dragging.code : payloadGroupId === row.groupId ? payloadCode : ''
    if (!sourceCode) {
      clearDragState()
      return
    }
    const nextRanking = reorderRanking(row.ranking, sourceCode, code)
    clearDragState()
    onRankingReorder(row, nextRanking)
  }

  return (
    <SideListPanelV2
      title="Your group predictions"
      subtitle="Drag each group to rank teams 1-4."
      actions={<div className="v2-type-meta">{groupsDone}/{groupsTotal} groups complete</div>}
      className="group-stage-v2-leaderboard"
      contentClassName="v2-list-divider space-y-0 p-0"
    >
      <div className="min-h-0">
        {rows.map((row) => {
          const firstPick = row.ranking[0] ?? ''
          const secondPick = row.ranking[1] ?? ''
          const rowDelta = resolveRowDelta({
            row,
            first: firstPick,
            second: secondPick,
            groupQualifierPoints
          })
          const deltaTag = resolveDeltaTag(row, rowDelta)
          const teamByCode = new Map(row.teams.map((team) => [team.code, team]))
          const rowIsSaving = saveStatus === 'saving' && savingRowGroupId === row.groupId
          const rowIsSaved = saveStatus !== 'saving' && savedRowGroupId === row.groupId
          const rowIsEditing = (dragging?.groupId === row.groupId || dragOver?.groupId === row.groupId) && !isReadOnly
          const interactionTag = isReadOnly
            ? { tone: 'locked' as const, label: 'Locked' }
            : rowIsSaving
              ? { tone: 'warning' as const, label: 'Saving...' }
              : rowIsSaved
                ? { tone: 'success' as const, label: 'Saved' }
                : null
          const interactionHintLabel = rowIsEditing ? 'Unsaved' : null

          return (
            <div
              key={`group-row-${row.groupId}`}
              className={cn('px-3 py-2.5', saveStatus === 'error' ? 'ring-1 ring-destructive/40 ring-inset' : undefined)}
            >
              <div className="v2-type-meta mb-2.5 flex flex-wrap items-start gap-2">
                <div className="min-w-0 v2-type-caption">
                  {`Published matches complete: ${row.finishedCount}/${row.totalCount}`}
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <StatusTagV2 tone={row.rankingComplete ? 'success' : 'warning'}>
                    {row.rankingComplete ? 'All set' : 'Incomplete'}
                  </StatusTagV2>
                  <StatusTagV2 tone={deltaTag.tone}>
                    {deltaTag.label}
                  </StatusTagV2>
                  {interactionTag ? (
                    <StatusTagV2 tone={interactionTag.tone}>{interactionTag.label}</StatusTagV2>
                  ) : interactionHintLabel ? (
                    <InlineStateHintV2>{interactionHintLabel}</InlineStateHintV2>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                {row.ranking.map((teamCode, index) => {
                  const team = teamByCode.get(teamCode)
                  const isDragging = dragging?.groupId === row.groupId && dragging.code === teamCode
                  const isDragOver = dragOver?.groupId === row.groupId && dragOver.code === teamCode

                  return (
                    <RowShellV2
                      key={`${row.groupId}-${teamCode}`}
                      depth="embedded"
                      state={isReadOnly ? 'disabled' : isDragOver || rowIsEditing ? 'selected' : 'default'}
                      tone="inset"
                      draggable={!isDragDisabled}
                      className={cn(
                        'flex min-h-12 items-center justify-between gap-2 px-2.5 py-2.5',
                        !isDragDisabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                        isDragging ? 'opacity-70 ring-1 ring-ring/40' : undefined,
                        isDragOver ? 'border-ring/70' : undefined
                      )}
                      onDragStart={(event) => handleDragStart(event, row, teamCode)}
                      onDragOver={(event) => handleDragOver(event, row, teamCode)}
                      onDrop={(event) => handleDrop(event, row, teamCode)}
                      onDragEnd={clearDragState}
                      interactive={!isDragDisabled}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="v2-type-chip inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/55 font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_24%,transparent)]">
                          {index + 1}
                        </span>
                        <TeamIdentityInlineV2
                          code={team?.code ?? teamCode}
                          name={team?.name ?? teamCode}
                          showName
                          className="v2-type-body-sm min-w-0 text-foreground"
                          primaryClassName="v2-track-10 font-semibold"
                        />
                        <span className="truncate v2-type-caption">
                          {slotContextLabel(index)}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="v2-type-meta font-mono leading-none" aria-hidden="true">
                          ::
                        </span>
                      </div>
                    </RowShellV2>
                  )
                })}
              </div>
            </div>
          )
        })}

        {rows.length === 0 ? <div className="px-3 py-3 v2-type-meta">No groups available.</div> : null}
      </div>
    </SideListPanelV2>
  )
}

type BestThirdPicksCompactProps = {
  tiles: BestThirdGroupTile[]
  selectedCount: number
  totalCount: number
  meterLabel: string
  hintLabel: string
  statusLabel?: string | null
  defaultCollapsed: boolean
  isReadOnly: boolean
  isDirty: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'locked'
  warning?: ReactNode
  onToggleGroup: (groupId: string) => void
  onSave: () => void
}

function bestThirdSurfaceClass(status: BestThirdStatus): string {
  if (status === 'qualified') return 'bg-success/10'
  if (status === 'missed') return 'bg-destructive/10'
  if (status === 'locked') return 'bg-warn/10'
  return 'bg-background/40'
}

function bestThirdStatusText(status: BestThirdStatus): string | null {
  if (status === 'qualified') return 'Correct'
  if (status === 'missed') return 'Incorrect'
  if (status === 'locked') return 'Locked'
  return null
}

function bestThirdStatusTone(status: BestThirdStatus): 'success' | 'danger' | 'locked' | null {
  if (status === 'qualified') return 'success'
  if (status === 'missed') return 'danger'
  if (status === 'locked') return 'locked'
  return null
}

export function BestThirdPicksCompact({
  tiles,
  selectedCount,
  totalCount,
  meterLabel,
  hintLabel,
  statusLabel,
  defaultCollapsed,
  isReadOnly,
  isDirty,
  saveStatus,
  warning,
  onToggleGroup,
  onSave
}: BestThirdPicksCompactProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    setCollapsed(defaultCollapsed)
  }, [defaultCollapsed])

  return (
    <SideListPanelV2
      title={meterLabel}
      subtitle="Pick 8 third-place groups."
      className="group-stage-v2-leaderboard"
      contentClassName="space-y-2 p-3"
      actions={(
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <StatusTagV2 tone={selectedCount < totalCount ? 'warning' : 'success'}>
            {hintLabel}
          </StatusTagV2>

          {statusLabel ? (
            <StatusTagV2 tone={statusLabel === 'Final' ? 'success' : statusLabel === 'Locked' ? 'locked' : 'warning'}>
              {statusLabel}
            </StatusTagV2>
          ) : null}

          {!isReadOnly && isDirty ? (
            <Button size="sm" className="h-8 rounded-md px-2.5" loading={saveStatus === 'saving'} onClick={onSave}>
              Save
            </Button>
          ) : null}

          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-md px-0"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand best third picks' : 'Collapse best third picks'}
          >
            {collapsed ? 'v' : '^'}
          </Button>
        </div>
      )}
    >
      {!collapsed ? (
        <>
          {warning ? <div className="v2-type-meta">{warning}</div> : null}
          <div className="group-stage-v2-best-third-list space-y-0">
            {tiles.map((tile) => {
              const tileDisabled = isReadOnly || tile.disabled
              const showNotReady = tile.blockedReason === 'not-ready'
              const showCapReached = tile.blockedReason === 'cap'
              const statusText = bestThirdStatusText(tile.status)
              const statusTone = bestThirdStatusTone(tile.status)
              const tooltipText = !isReadOnly
                ? showNotReady
                  ? 'Finish group ranking first.'
                  : showCapReached
                    ? 'Selection limit reached. Deselect another group first.'
                    : null
                : null
              const rowDisabled = isReadOnly || showNotReady
              return (
                <button
                  key={`best-third-group-${tile.groupId}`}
                  type="button"
                  disabled={rowDisabled}
                  aria-disabled={tileDisabled}
                  className={cn(
                    'group-stage-v2-best-third-row flex w-full items-center justify-between gap-2.5 border-x-0 border-y border-border/20 px-0 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    bestThirdSurfaceClass(tile.status)
                  )}
                  data-selected={tile.selected ? 'true' : 'false'}
                  data-disabled={tileDisabled ? 'true' : 'false'}
                  data-animate={tile.animateSelection ? 'true' : 'false'}
                  onClick={() => {
                    if (tileDisabled) return
                    onToggleGroup(tile.groupId)
                  }}
                >
                  <div className="min-w-0 flex items-center gap-2.5 px-3">
                    <span className="v2-track-10 v2-type-chip inline-flex h-7 shrink-0 items-center rounded-md border border-border/45 bg-background/55 px-2 font-semibold uppercase text-muted-foreground">
                      Group {tile.groupId}
                    </span>
                    <div className="min-w-0">
                      {showNotReady ? (
                        <span className="v2-type-meta">Third-place team pending.</span>
                      ) : (
                        <TeamIdentityInlineV2
                          code={tile.teamCode}
                          name={tile.teamName}
                          label={tile.teamCode}
                          showName
                          className="v2-type-body-sm max-w-full"
                          primaryClassName="font-semibold"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 px-3">
                    {tooltipText ? (
                      <span className="group/third-place-tip relative inline-flex">
                        <span
                          aria-hidden="true"
                          className="group-stage-v2-tip-indicator"
                        >
                          !
                        </span>
                        <span
                          role="tooltip"
                          className="group-stage-v2-block-tooltip pointer-events-none absolute bottom-[calc(100%+0.35rem)] right-0 z-20 opacity-0 transition-all group-hover/third-place-tip:opacity-100"
                        >
                          {tooltipText}
                        </span>
                      </span>
                    ) : null}
                    {statusText && statusTone ? (
                      <StatusTagV2 tone={statusTone}>{statusText}</StatusTagV2>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
    </SideListPanelV2>
  )
}
