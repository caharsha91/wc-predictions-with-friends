import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { GroupPrediction } from '../../../types/bracket'
import type { BestThirdStatus, GroupPlacementStatus } from '../../../lib/groupStageSnapshot'
import type { Team } from '../../../types/matches'
import { SNAPSHOT_UNAVAILABLE_LABEL } from '../../lib/snapshotStamp'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button, ButtonLink } from '../ui/Button'
import V2Card from '../v2/V2Card'

export type GroupStageDenseRow = {
  groupId: string
  teams: Team[]
  prediction: GroupPrediction
  complete: boolean
  actualTopTwo: string[]
  finishedCount: number
  totalCount: number
  firstResult: GroupPlacementStatus
  secondResult: GroupPlacementStatus
  rowResult: GroupPlacementStatus
}

type GroupStageRowDraft = {
  first: string
  second: string
}

export type LeaderboardCardRow = {
  id: string
  name: string
  rank: number
  points: number
  movement?: number
  deltaPoints?: number
  isYou: boolean
}

type BestThirdSlot = {
  index: number
  code: string
  status: BestThirdStatus
  options: Team[]
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
    <V2Card className="rounded-xl px-4 py-2 xl:h-14 xl:py-0">
      <div className="flex h-full items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight text-foreground">Group stage</div>
          <div className="truncate text-[11px] text-muted-foreground">Updates daily from published snapshots.</div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 p-1">
          <ButtonLink to={playCenterPath} size="sm" variant="pill" className="h-8 rounded-lg px-3 text-[12px]">
            Play Center
          </ButtonLink>
          <ButtonLink to={leaderboardPath} size="sm" variant="pillSecondary" className="h-8 rounded-lg px-3 text-[12px]">
            Leaderboard
          </ButtonLink>
        </div>

        <div className="hidden min-w-0 max-w-[34ch] items-center gap-2 text-[11px] text-muted-foreground lg:flex">
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
    <V2Card className="rounded-xl px-3 py-1.5 xl:h-9 xl:py-0">
      <div className="flex h-full items-center gap-2.5 overflow-hidden">
        <Badge tone={groupsDone === groupsTotal && groupsTotal > 0 ? 'success' : 'warning'} className="h-6 rounded-full px-2 text-[11px] normal-case tracking-normal">
          Groups {groupsDone}/{groupsTotal}
        </Badge>
        <Badge tone={bestThirdDone === bestThirdTotal ? 'success' : 'warning'} className="h-6 rounded-full px-2 text-[11px] normal-case tracking-normal">
          Best Thirds {bestThirdDone}/{bestThirdTotal}
        </Badge>
        <Badge tone="info" className="h-6 rounded-full px-2 text-[11px] normal-case tracking-normal">
          Closes {closesLabel}
        </Badge>
        <Badge tone={stateLabel === 'Final' ? 'success' : 'secondary'} className="h-6 rounded-full px-2 text-[11px] normal-case tracking-normal">
          State {stateLabel}
        </Badge>
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

function formatTeamLabel(code: string | undefined, teams: Team[]): string {
  if (!code) return 'Select team'
  const team = teams.find((entry) => entry.code === code)
  return team ? `${team.code} · ${team.name}` : code
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

function markerMeta(result: GroupPlacementStatus): { icon: string; code: string; tooltip: string } {
  if (result === 'correct') return { icon: '✓', code: 'OK', tooltip: 'Correct' }
  if (result === 'incorrect') return { icon: '×', code: 'NO', tooltip: 'Incorrect' }
  if (result === 'locked') return { icon: '🔒', code: 'LCK', tooltip: 'Locked' }
  return { icon: '⏳', code: 'PEN', tooltip: 'Pending' }
}

function placementTone(result: GroupPlacementStatus): string {
  if (result === 'correct') return 'text-foreground'
  if (result === 'incorrect') return 'text-foreground'
  if (result === 'locked') return 'text-muted-foreground'
  return 'text-muted-foreground'
}

type GroupPicksDenseTableProps = {
  rows: GroupStageDenseRow[]
  showPoints: boolean
  isReadOnly: boolean
  groupClosedByTime: boolean
  groupQualifierPoints: number
  tableStatusLabel: string
  pointsContextLabel: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'locked'
  savedRowGroupId: string | null
  rowDrafts: Record<string, GroupStageRowDraft>
  onTogglePoints: () => void
  onPickChange: (row: GroupStageDenseRow, field: 'first' | 'second', value: string) => void
  onRowSave: (row: GroupStageDenseRow) => void
  onRowCancel: (groupId: string) => void
}

export function GroupPicksDenseTable({
  rows,
  showPoints,
  isReadOnly,
  groupClosedByTime,
  groupQualifierPoints,
  tableStatusLabel,
  pointsContextLabel,
  saveStatus,
  savedRowGroupId,
  rowDrafts,
  onTogglePoints,
  onPickChange,
  onRowSave,
  onRowCancel
}: GroupPicksDenseTableProps) {
  const gridColumnsClass = 'grid grid-cols-[88px_minmax(0,1fr)_minmax(0,1fr)_150px] items-center gap-3.5'

  return (
    <V2Card className="h-full min-h-0 rounded-xl overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 flex-wrap items-center gap-2 border-b border-border/60 px-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Group Picks</div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant={showPoints ? 'primary' : 'secondary'}
              className="h-8 rounded-lg px-2 text-[12px]"
              onClick={onTogglePoints}
            >
              Points {showPoints ? 'On' : 'Off'}
            </Button>
          </div>
        </div>

        <div className="flex h-9 items-center gap-3 border-b border-border/50 px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
          <div className="flex min-w-0 items-center gap-2 truncate">
            <span className="truncate">Table {tableStatusLabel}</span>
            <Badge
              tone={tableStatusLabel === 'Final' ? 'success' : 'warning'}
              title={tableStatusLabel === 'Final' ? 'Finalized scoring.' : 'Points are potential until groups finalize.'}
              className="h-5 px-1.5 text-[9px] normal-case tracking-normal"
            >
              {tableStatusLabel === 'Final' ? 'FINAL' : 'PENDING'}
            </Badge>
            {isReadOnly ? <span className="truncate">{groupClosedByTime ? 'Locked' : 'Final recap'}</span> : null}
          </div>

          {showPoints ? (
            <div className="ml-auto flex min-w-0 items-center gap-2 overflow-hidden text-[10px] leading-none md:text-[11px]">
              <span className="truncate">{pointsContextLabel}</span>
              <span className="truncate whitespace-nowrap" title="Correct / Incorrect / Pending / Locked">
                ✓ OK × NO ⏳ PEN 🔒 LCK
              </span>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="hidden h-full min-h-0 overflow-auto md:block">
            <div className="min-w-[760px]">
              <div className={cn(gridColumnsClass, 'h-8 px-3 text-[11px] uppercase tracking-wide text-muted-foreground')}>
                <div>Group</div>
                <div>1st Pick</div>
                <div>2nd Pick</div>
                <div className="text-right">Actions</div>
              </div>

              <div className="divide-y divide-border/45">
                {rows.map((row) => {
                  const persistedFirst = row.prediction.first ?? ''
                  const persistedSecond = row.prediction.second ?? ''
                  const draft = rowDrafts[row.groupId]
                  const effectiveFirst = draft?.first ?? persistedFirst
                  const effectiveSecond = draft?.second ?? persistedSecond
                  const rowHasUnsavedChanges = Boolean(
                    draft && (draft.first !== persistedFirst || draft.second !== persistedSecond)
                  )
                  const rowIsValid = Boolean(effectiveFirst) && Boolean(effectiveSecond) && effectiveFirst !== effectiveSecond
                  const rowDelta = resolveRowDelta({
                    row,
                    first: effectiveFirst,
                    second: effectiveSecond,
                    groupQualifierPoints
                  })

                  return (
                    <div
                      key={`desktop-group-row-${row.groupId}`}
                      className={cn(
                        gridColumnsClass,
                        rowSurfaceClass(row.rowResult),
                        'h-11 px-3 transition-colors hover:bg-background/80 focus-within:bg-background/80 focus-within:ring-1 focus-within:ring-ring',
                        rowHasUnsavedChanges ? 'ring-1 ring-ring/35' : undefined
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg border border-border text-[12px] font-medium text-foreground">
                          {row.groupId}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {isReadOnly ? (
                            <div className="truncate text-[12px] text-foreground">{formatTeamLabel(effectiveFirst || undefined, row.teams)}</div>
                          ) : (
                            <select
                              value={effectiveFirst}
                              className="h-9 w-full min-w-0 rounded-lg border border-border bg-background/60 px-2 text-[12px] text-foreground hover:bg-background/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                              onChange={(event) => onPickChange(row, 'first', event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  onRowCancel(row.groupId)
                                }
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  onRowSave(row)
                                }
                              }}
                              disabled={isReadOnly}
                            >
                              <option value="">Select team</option>
                              {row.teams.map((team) => (
                                <option key={`${row.groupId}-first-${team.code}`} value={team.code}>
                                  {team.code} · {team.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {effectiveFirst ? (
                            <span
                              title={markerMeta(row.firstResult).tooltip}
                              className={cn(
                                'inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none md:text-[11px]',
                                placementTone(row.firstResult)
                              )}
                            >
                              <span aria-hidden="true">{markerMeta(row.firstResult).icon}</span>
                              <span>{markerMeta(row.firstResult).code}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {isReadOnly ? (
                            <div className="truncate text-[12px] text-foreground">{formatTeamLabel(effectiveSecond || undefined, row.teams)}</div>
                          ) : (
                            <select
                              value={effectiveSecond}
                              className="h-9 w-full min-w-0 rounded-lg border border-border bg-background/60 px-2 text-[12px] text-foreground hover:bg-background/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                              onChange={(event) => onPickChange(row, 'second', event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault()
                                  onRowCancel(row.groupId)
                                }
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  onRowSave(row)
                                }
                              }}
                              disabled={isReadOnly}
                            >
                              <option value="">Select team</option>
                              {row.teams.map((team) => (
                                <option key={`${row.groupId}-second-${team.code}`} value={team.code}>
                                  {team.code} · {team.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {effectiveSecond ? (
                            <span
                              title={markerMeta(row.secondResult).tooltip}
                              className={cn(
                                'inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none md:text-[11px]',
                                placementTone(row.secondResult)
                              )}
                            >
                              <span aria-hidden="true">{markerMeta(row.secondResult).icon}</span>
                              <span>{markerMeta(row.secondResult).code}</span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {showPoints && rowDelta !== 0 ? (
                          <span className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-border bg-background px-1.5 text-[11px] font-medium text-muted-foreground">
                            +{rowDelta}
                          </span>
                        ) : (
                          <span className="inline-flex h-6 min-w-10" aria-hidden="true" />
                        )}

                        <div className="flex min-w-[142px] items-center justify-end gap-1.5">
                          {rowHasUnsavedChanges ? (
                            <span title="Unsaved changes" className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[10px] text-muted-foreground">
                              Edited
                            </span>
                          ) : null}
                          {!rowHasUnsavedChanges && savedRowGroupId === row.groupId ? (
                            <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[10px] text-muted-foreground">
                              Saved
                            </span>
                          ) : null}
                          <Button
                            size="sm"
                            loading={saveStatus === 'saving'}
                            disabled={!rowHasUnsavedChanges || !rowIsValid || isReadOnly}
                            tabIndex={rowHasUnsavedChanges ? 0 : -1}
                            aria-hidden={!rowHasUnsavedChanges}
                            className={cn(
                              'h-8 rounded-lg px-3 text-[12px]',
                              rowHasUnsavedChanges ? 'opacity-100' : 'pointer-events-none opacity-0'
                            )}
                            onClick={() => onRowSave(row)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            tabIndex={rowHasUnsavedChanges ? 0 : -1}
                            aria-hidden={!rowHasUnsavedChanges}
                            className={cn(
                              'h-8 w-8 rounded-lg px-0 text-[12px]',
                              rowHasUnsavedChanges ? 'opacity-100' : 'pointer-events-none opacity-0'
                            )}
                            onClick={() => onRowCancel(row.groupId)}
                            aria-label={`Cancel edits for group ${row.groupId}`}
                          >
                            x
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {rows.length === 0 ? (
                  <div className="h-10 px-3 text-[12px] text-muted-foreground">No groups available.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2 overflow-auto p-2.5 md:hidden">
            {rows.map((row) => {
              const persistedFirst = row.prediction.first ?? ''
              const persistedSecond = row.prediction.second ?? ''
              const draft = rowDrafts[row.groupId]
              const effectiveFirst = draft?.first ?? persistedFirst
              const effectiveSecond = draft?.second ?? persistedSecond
              const rowHasUnsavedChanges = Boolean(draft && (draft.first !== persistedFirst || draft.second !== persistedSecond))
              const rowIsValid = Boolean(effectiveFirst) && Boolean(effectiveSecond) && effectiveFirst !== effectiveSecond
              const rowDelta = resolveRowDelta({
                row,
                first: effectiveFirst,
                second: effectiveSecond,
                groupQualifierPoints
              })

              return (
                <div key={`mobile-group-row-${row.groupId}`} className={cn('rounded-lg border border-border bg-background/40 p-2', rowSurfaceClass(row.rowResult))}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-10 items-center justify-center rounded-lg border border-border text-[12px] font-medium text-foreground">
                        {row.groupId}
                      </span>
                    </div>
                    {showPoints && rowDelta !== 0 ? (
                      <span className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-border px-2 text-[11px] text-muted-foreground">
                        +{rowDelta}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2.5 grid gap-2.5">
                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      1st Pick
                      <div className="flex items-center gap-1.5">
                        {isReadOnly ? (
                          <div className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[12px] leading-10 text-foreground">
                            {formatTeamLabel(effectiveFirst || undefined, row.teams)}
                          </div>
                        ) : (
                          <select
                            value={effectiveFirst}
                            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-2 text-[12px] text-foreground hover:bg-background/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                            onChange={(event) => onPickChange(row, 'first', event.target.value)}
                          >
                            <option value="">Select team</option>
                            {row.teams.map((team) => (
                              <option key={`mobile-${row.groupId}-first-${team.code}`} value={team.code}>
                                {team.code} · {team.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {effectiveFirst ? (
                          <span title={markerMeta(row.firstResult).tooltip} className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none">
                            <span aria-hidden="true">{markerMeta(row.firstResult).icon}</span>
                            <span>{markerMeta(row.firstResult).code}</span>
                          </span>
                        ) : null}
                      </div>
                    </label>

                    <label className="grid gap-1 text-[11px] text-muted-foreground">
                      2nd Pick
                      <div className="flex items-center gap-1.5">
                        {isReadOnly ? (
                          <div className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[12px] leading-10 text-foreground">
                            {formatTeamLabel(effectiveSecond || undefined, row.teams)}
                          </div>
                        ) : (
                          <select
                            value={effectiveSecond}
                            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-2 text-[12px] text-foreground hover:bg-background/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                            onChange={(event) => onPickChange(row, 'second', event.target.value)}
                          >
                            <option value="">Select team</option>
                            {row.teams.map((team) => (
                              <option key={`mobile-${row.groupId}-second-${team.code}`} value={team.code}>
                                {team.code} · {team.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {effectiveSecond ? (
                          <span title={markerMeta(row.secondResult).tooltip} className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none">
                            <span aria-hidden="true">{markerMeta(row.secondResult).icon}</span>
                            <span>{markerMeta(row.secondResult).code}</span>
                          </span>
                        ) : null}
                      </div>
                    </label>
                  </div>

                  {!isReadOnly ? (
                    <div className="mt-2 flex min-h-10 items-center justify-end">
                      <div className={cn('flex items-center gap-2 transition-opacity', rowHasUnsavedChanges ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                        <Button
                          size="sm"
                          className="h-10 rounded-lg px-3 text-[12px]"
                          loading={saveStatus === 'saving'}
                          disabled={!rowHasUnsavedChanges || !rowIsValid}
                          onClick={() => onRowSave(row)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-10 rounded-lg px-3 text-[12px]"
                          onClick={() => onRowCancel(row.groupId)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {rows.length === 0 ? (
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2 text-[12px] text-muted-foreground">
                No groups available.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </V2Card>
  )
}

type BestThirdPicksCompactProps = {
  slots: BestThirdSlot[]
  selectedCount: number
  totalCount: number
  selectedCodes: string[]
  statusLabel: string
  defaultCollapsed: boolean
  isReadOnly: boolean
  isDirty: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error' | 'locked'
  warning?: ReactNode
  resolveTeamLabel: (code: string | undefined) => string
  onSlotChange: (index: number, value: string) => void
  onSave: () => void
}

function bestThirdSurfaceClass(status: BestThirdStatus): string {
  if (status === 'qualified') return 'bg-success/10'
  if (status === 'missed') return 'bg-destructive/10'
  if (status === 'locked') return 'bg-warn/10'
  return 'bg-background/40'
}

function bestThirdStatusText(status: BestThirdStatus): string {
  if (status === 'qualified') return 'Correct'
  if (status === 'missed') return 'Incorrect'
  if (status === 'locked') return 'Locked'
  return 'Pending'
}

export function BestThirdPicksCompact({
  slots,
  selectedCount,
  totalCount,
  selectedCodes,
  statusLabel,
  defaultCollapsed,
  isReadOnly,
  isDirty,
  saveStatus,
  warning,
  resolveTeamLabel,
  onSlotChange,
  onSave
}: BestThirdPicksCompactProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    setCollapsed(defaultCollapsed)
  }, [defaultCollapsed])

  return (
    <V2Card className="rounded-xl overflow-hidden">
      <div className="flex h-10 items-center gap-2 border-b border-border/60 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">Best 3rd Picks - Selected {selectedCount}/{totalCount}</div>
        </div>

        <div className="hidden min-w-0 max-w-[14rem] items-center gap-1 overflow-hidden lg:flex">
          {selectedCodes.slice(0, 6).map((code) => (
            <span key={`best-third-chip-${code}`} className="inline-flex h-5 items-center rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
              {code}
            </span>
          ))}
          {selectedCodes.length > 6 ? (
            <span className="inline-flex h-5 items-center rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">+{selectedCodes.length - 6}</span>
          ) : null}
        </div>

        <Badge tone={statusLabel === 'Final' ? 'success' : statusLabel === 'Locked' ? 'locked' : 'warning'} className="h-6 rounded-full px-2 text-[11px] normal-case tracking-normal">
          {statusLabel}
        </Badge>

        {!isReadOnly && isDirty ? (
          <Button size="sm" className="h-8 rounded-lg px-3 text-[12px]" loading={saveStatus === 'saving'} onClick={onSave}>
            Save
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg px-0 text-[13px] lg:hidden" onClick={() => setCollapsed((current) => !current)} aria-label={collapsed ? 'Expand best third picks' : 'Collapse best third picks'}>
          {collapsed ? 'v' : '^'}
        </Button>
      </div>

      {!collapsed ? (
        <div className="p-3 max-md:max-h-72 max-md:overflow-y-auto">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {slots.map((slot) => (
              <div key={`best-third-slot-${slot.index}`} className={cn('rounded-lg border border-border px-2.5 py-2', bestThirdSurfaceClass(slot.status))}>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">Slot {slot.index + 1}</div>
                {isReadOnly ? (
                  <div className="h-10 rounded-lg border border-border bg-background px-2 text-[12px] leading-10 text-foreground sm:h-9 sm:leading-9">
                    {resolveTeamLabel(slot.code || undefined)}
                  </div>
                ) : (
                  <select
                    className="h-10 w-full rounded-lg border border-border bg-background px-2 text-[12px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:h-9"
                    value={slot.code}
                    onChange={(event) => onSlotChange(slot.index, event.target.value)}
                  >
                    <option value="">Select</option>
                    {slot.options.map((team) => (
                      <option key={`best-third-option-${slot.index}-${team.code}`} value={team.code}>
                        {team.code} · {team.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">{bestThirdStatusText(slot.status)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warning ? <div className="px-3 pb-3 text-[12px]">{warning}</div> : null}
    </V2Card>
  )
}

type RightRailStickyProps = {
  children: ReactNode
}

export function RightRailSticky({ children }: RightRailStickyProps) {
  return <aside className="max-xl:static xl:sticky xl:top-[calc(var(--toolbar-h,56px)+var(--meta-h,32px)+20px)] xl:self-start">{children}</aside>
}

type LeaderboardCardCuratedProps = {
  rows: LeaderboardCardRow[]
  snapshotLabel: string
  topCount: 3 | 5
  title: string
}

function movementLabel(movement: number | undefined): string {
  if (typeof movement !== 'number' || movement === 0) return '-'
  return movement > 0 ? `up ${movement}` : `down ${Math.abs(movement)}`
}

function curateRows(rows: LeaderboardCardRow[], topCount: number): LeaderboardCardRow[] {
  const ranked = [...rows].sort((a, b) => a.rank - b.rank)
  if (ranked.length <= topCount + 4) return ranked

  const curated: LeaderboardCardRow[] = []
  const seen = new Set<string>()

  const add = (row: LeaderboardCardRow) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    curated.push(row)
  }

  ranked.slice(0, topCount).forEach(add)

  const youIndex = ranked.findIndex((row) => row.isYou)
  if (youIndex >= 0) {
    const start = Math.max(0, youIndex - 2)
    const end = Math.min(ranked.length - 1, youIndex + 2)
    for (let index = start; index <= end; index += 1) {
      add(ranked[index])
    }
  }

  ranked
    .filter((row) => typeof row.movement === 'number' && row.movement !== 0)
    .sort((a, b) => {
      const absDelta = Math.abs(b.movement ?? 0) - Math.abs(a.movement ?? 0)
      if (absDelta !== 0) return absDelta
      return a.rank - b.rank
    })
    .slice(0, 2)
    .forEach(add)

  const targetCount = Math.min(ranked.length, topCount + 6)
  if (curated.length < targetCount) {
    for (const row of ranked) {
      add(row)
      if (curated.length >= targetCount) break
    }
  }

  return curated
}

export function LeaderboardCardCurated({ rows, snapshotLabel, topCount, title }: LeaderboardCardCuratedProps) {
  const [showFull, setShowFull] = useState(false)

  const rankedRows = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank), [rows])
  const curatedRows = useMemo(() => curateRows(rankedRows, topCount), [rankedRows, topCount])
  const topRows = useMemo(() => rankedRows.slice(0, topCount), [rankedRows, topCount])
  const topHasYou = topRows.some((row) => row.isYou)
  const youRow = rankedRows.find((row) => row.isYou) ?? null
  const curatedWithoutYou = useMemo(() => curatedRows.filter((row) => !row.isYou), [curatedRows])
  const shouldPinYouInCurated = !showFull && !topHasYou && Boolean(youRow)
  const displayRows = showFull
    ? rankedRows
    : shouldPinYouInCurated
      ? [...curatedWithoutYou, ...(youRow ? [youRow] : [])]
      : curatedRows

  return (
    <V2Card className="rounded-xl overflow-hidden">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {snapshotLabel === SNAPSHOT_UNAVAILABLE_LABEL ? snapshotLabel : `As of ${snapshotLabel}`}
          </div>
        </div>

        {rows.length > curatedRows.length ? (
          <Button size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[11px]" onClick={() => setShowFull((current) => !current)}>
            {showFull ? 'Hide full' : 'View full'}
          </Button>
        ) : null}
      </div>

      <div className={cn('space-y-1.5 p-3', showFull ? 'max-h-72 overflow-y-auto pr-1' : undefined)}>
        {displayRows.map((row, index) => (
          <div key={`leaderboard-row-wrap-${row.id}`}>
            {shouldPinYouInCurated && row.isYou && index > 0 ? <div className="my-1 h-px bg-border/70" aria-hidden="true" /> : null}
            <div
              key={`leaderboard-row-${row.id}`}
              className={cn(
                'flex h-10 items-center justify-between rounded-lg border border-border px-3 text-[12px] transition-colors hover:bg-background/70',
                row.isYou ? 'bg-background/80 ring-1 ring-ring/50' : 'bg-background/35'
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">#{row.rank} {row.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  Move {movementLabel(row.movement)}
                  {row.isYou ? (
                    <span className="ml-1 rounded-full border border-border px-1 py-0.5 text-[9px] uppercase tracking-[0.12em]">You</span>
                  ) : null}
                </div>
              </div>

              <div className="text-right text-[11px] text-muted-foreground">
                <div className="tabular-nums text-foreground">{row.points} pts</div>
                {typeof row.deltaPoints === 'number' ? (
                  <div className="tabular-nums">{row.deltaPoints >= 0 ? '+' : ''}{row.deltaPoints}</div>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/35 px-3 py-2 text-[12px] text-muted-foreground">
            No leaderboard snapshot rows available.
          </div>
        ) : null}
      </div>
    </V2Card>
  )
}
