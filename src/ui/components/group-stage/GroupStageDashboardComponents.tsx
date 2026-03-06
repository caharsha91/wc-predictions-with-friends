import { useEffect, useState, type DragEvent, type ReactNode } from 'react'

import type { GroupPrediction } from '../../../types/bracket'
import type { BestThirdStatus, GroupPlacementStatus } from '../../../lib/groupStageSnapshot'
import type { Team } from '../../../types/matches'
import { cn } from '../../lib/utils'
import { Button, ButtonLink } from '../ui/Button'
import RowShellV2 from '../v2/RowShellV2'
import SectionCardV2 from '../v2/SectionCardV2'
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
          <div className="truncate text-base font-semibold tracking-tight text-foreground">Group stage</div>
          <div className="truncate text-[11px] text-muted-foreground">Updates daily from published snapshots.</div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 p-1">
          <ButtonLink to={playCenterPath} size="sm" variant="pill" className="v2-action-compact">
            Play Center
          </ButtonLink>
          <ButtonLink to={leaderboardPath} size="sm" variant="pillSecondary" className="v2-action-compact">
            Leaderboard
          </ButtonLink>
        </div>

        <div className="min-w-0 max-w-[34ch] items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate whitespace-nowrap">Saved {picksLastSavedLabel}</span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span className="truncate whitespace-nowrap">Snapshot {scoringSnapshotLabel}</span>
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
      <div className="flex h-full items-center gap-2.5 overflow-hidden">
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

function rowSurfaceClass(result: GroupPlacementStatus): string {
  if (result === 'correct') return 'bg-success/10'
  if (result === 'incorrect') return 'bg-destructive/10'
  if (result === 'locked') return 'bg-warn/10'
  return 'bg-background/40'
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
    <SectionCardV2 tone="panel" density="none" className="group-stage-v2-table rounded-xl overflow-hidden">
      <div className="flex flex-col">
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border/35 px-3">
          <div className="text-[13px] font-semibold tracking-[0.02em] text-foreground">Group picks</div>
          <div className="text-[13px] text-muted-foreground">{groupsDone}/{groupsTotal} groups complete</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-3 p-3">
            {rows.map((row) => {
              const firstPick = row.ranking[0] ?? ''
              const secondPick = row.ranking[1] ?? ''
              const rowDelta = resolveRowDelta({
                row,
                first: firstPick,
                second: secondPick,
                groupQualifierPoints
              })
              const teamByCode = new Map(row.teams.map((team) => [team.code, team]))

              return (
                <div
                  key={`group-row-${row.groupId}`}
                  className={cn(
                    'rounded-xl p-3 shadow-[var(--shadow0)]',
                    rowSurfaceClass(row.rowResult),
                    saveStatus === 'error' ? 'ring-1 ring-destructive/40' : undefined
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg bg-background/55 text-[12px] font-medium text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_26%,transparent)]">
                      {row.groupId}
                    </span>
                    <StatusTagV2 tone={row.rankingComplete ? 'success' : 'warning'}>
                      {row.rankingComplete ? 'All set' : 'Incomplete'}
                    </StatusTagV2>
                    <StatusTagV2 tone="secondary">
                      Potential +{rowDelta}
                    </StatusTagV2>
                    {saveStatus === 'saving' && savingRowGroupId === row.groupId ? (
                      <StatusTagV2 tone="warning">
                        Saving...
                      </StatusTagV2>
                    ) : null}
                    {saveStatus !== 'saving' && savedRowGroupId === row.groupId ? (
                      <StatusTagV2 tone="success">
                        Saved
                      </StatusTagV2>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {row.ranking.map((teamCode, index) => {
                      const team = teamByCode.get(teamCode)
                      const isDragging = dragging?.groupId === row.groupId && dragging.code === teamCode
                      const isDragOver = dragOver?.groupId === row.groupId && dragOver.code === teamCode

                      return (
                        <RowShellV2
                          key={`${row.groupId}-${teamCode}`}
                          state={isDragOver ? 'selected' : 'default'}
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
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/55 text-[11px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--border)_24%,transparent)]">
                              {index + 1}
                            </span>
                            <TeamIdentityInlineV2
                              code={team?.code ?? teamCode}
                              name={team?.name ?? teamCode}
                              showName
                              className="min-w-0 text-[14px] leading-tight text-foreground"
                              primaryClassName="font-semibold tracking-wide"
                            />
                            <span className="truncate text-[12px] text-muted-foreground">
                              {slotContextLabel(index)}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[12px] text-muted-foreground">{isDragDisabled ? 'Locked' : 'Drag to reorder'}</span>
                            <span className="font-mono text-[13px] leading-none text-muted-foreground" aria-hidden="true">
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

            {rows.length === 0 ? <div className="h-10 px-1 text-[13px] text-muted-foreground">No groups available.</div> : null}
          </div>
        </div>
      </div>
    </SectionCardV2>
  )
}

type BestThirdPicksCompactProps = {
  tiles: BestThirdGroupTile[]
  selectedCount: number
  totalCount: number
  meterLabel: string
  hintLabel: string
  helperText?: string | null
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

export function BestThirdPicksCompact({
  tiles,
  selectedCount,
  totalCount,
  meterLabel,
  hintLabel,
  helperText,
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
    <SectionCardV2 tone="panel" density="none" className="group-stage-v2-best-third rounded-xl overflow-hidden">
      <div className="flex h-10 items-center gap-2 border-b border-border/35 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-foreground">{meterLabel}</div>
        </div>

        <StatusTagV2 tone={selectedCount < totalCount ? 'warning' : 'success'}>
          {hintLabel}
        </StatusTagV2>

        {statusLabel ? (
          <StatusTagV2 tone={statusLabel === 'Final' ? 'success' : statusLabel === 'Locked' ? 'locked' : 'warning'}>
            {statusLabel}
          </StatusTagV2>
        ) : null}

        {!isReadOnly && isDirty ? (
          <Button size="sm" className="h-9 rounded-lg px-3 text-[13px]" loading={saveStatus === 'saving'} onClick={onSave}>
            Save
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg px-0 text-[13px]" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? 'Expand best third picks' : 'Collapse best third picks'}>
          {collapsed ? 'v' : '^'}
        </Button>
      </div>

      {!collapsed ? (
        <div className="p-3">
          {warning ? <div className="mb-2 text-[13px]">{warning}</div> : null}
          <div className="group-stage-v2-best-third-list space-y-2">
            {tiles.map((tile) => {
              const tileDisabled = isReadOnly || tile.disabled
              const showNotReady = tile.blockedReason === 'not-ready'
              const showCapReached = tile.blockedReason === 'cap'
              const statusText = bestThirdStatusText(tile.status)
              const helperLabel = showNotReady ? null : statusText
              const rowDisabled = isReadOnly || showNotReady
              return (
                <button
                  key={`best-third-group-${tile.groupId}`}
                  type="button"
                  disabled={rowDisabled}
                  aria-disabled={tileDisabled}
                  className={cn(
                    'group-stage-v2-best-third-row flex w-full items-center justify-between gap-2.5 rounded-lg border px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className="inline-flex h-7 shrink-0 items-center rounded-md border border-border/45 bg-background/55 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Group {tile.groupId}
                    </span>
                    <div className="min-w-0">
                      {showNotReady ? (
                        <span className="text-[13px] text-muted-foreground">Complete ranking 1-4 first.</span>
                      ) : (
                        <TeamIdentityInlineV2
                          code={tile.teamCode}
                          name={tile.teamName}
                          label={tile.teamCode}
                          showName
                          className="max-w-full text-[13px]"
                          primaryClassName="font-semibold"
                        />
                      )}
                      {helperLabel ? <div className="mt-0.5 text-[11px] text-muted-foreground">{helperLabel}</div> : null}
                    </div>
                  </div>
                  {showCapReached ? (
                    <span className="group-stage-v2-cap-wrap shrink-0" aria-hidden="true">
                      <span className="group-stage-v2-cap-indicator">!</span>
                      <span role="tooltip" className="group-stage-v2-cap-tooltip">
                        Limit reached. Deselect another group first.
                      </span>
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          {helperText ? <div className="mt-2 text-[13px] text-[color:var(--v2-text-muted)]">{helperText}</div> : null}
        </div>
      ) : null}
    </SectionCardV2>
  )
}
