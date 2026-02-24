import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'

import type { GroupPrediction } from '../../../types/bracket'
import type { BestThirdStatus, GroupPlacementStatus } from '../../../lib/groupStageSnapshot'
import type { Team } from '../../../types/matches'
import { SNAPSHOT_UNAVAILABLE_LABEL } from '../../lib/snapshotStamp'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button, ButtonLink } from '../ui/Button'
import SectionCardV2 from '../v2/SectionCardV2'
import TeamFlagLabelV2 from '../v2/TeamFlagLabelV2'
import V2Card from '../v2/V2Card'

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

export type LeaderboardCardRow = {
  id: string
  name: string
  rank: number
  points: number
  movement?: number
  deltaPoints?: number
  isYou: boolean
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
          <ButtonLink to={playCenterPath} size="sm" variant="pill" className="h-8 rounded-lg px-3 text-[12px]">
            Play Center
          </ButtonLink>
          <ButtonLink to={leaderboardPath} size="sm" variant="pillSecondary" className="h-8 rounded-lg px-3 text-[12px]">
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
  if (result === 'correct') return { icon: '✓', code: 'Correct', tooltip: 'Correct' }
  if (result === 'incorrect') return { icon: '×', code: 'Incorrect', tooltip: 'Incorrect' }
  if (result === 'locked') return { icon: '🔒', code: 'Locked', tooltip: 'Locked' }
  return { icon: '⏳', code: 'Pending', tooltip: 'Pending' }
}

function placementTone(result: GroupPlacementStatus): string {
  if (result === 'correct') return 'text-foreground'
  if (result === 'incorrect') return 'text-foreground'
  if (result === 'locked') return 'text-muted-foreground'
  return 'text-muted-foreground'
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
        <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border/60 px-3">
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
                    'rounded-xl border border-border/60 p-3',
                    rowSurfaceClass(row.rowResult),
                    saveStatus === 'error' ? 'ring-1 ring-destructive/40' : undefined
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="inline-flex h-8 w-11 items-center justify-center rounded-lg border border-border text-[12px] font-medium text-foreground">
                      {row.groupId}
                    </span>
                    <span className={cn('font-medium', row.rankingComplete ? 'text-foreground' : 'text-muted-foreground')}>
                      {row.rankingComplete ? 'Complete' : 'Incomplete'}
                    </span>
                    <span className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-border bg-background px-2 text-[12px] font-medium text-muted-foreground">
                      Potential +{rowDelta}
                    </span>
                    {saveStatus === 'saving' && savingRowGroupId === row.groupId ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[12px] text-muted-foreground">
                        Saving...
                      </span>
                    ) : null}
                    {saveStatus !== 'saving' && savedRowGroupId === row.groupId ? (
                      <span className="inline-flex h-6 items-center rounded-full border border-border px-2 text-[12px] text-muted-foreground">
                        Saved
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {row.ranking.map((teamCode, index) => {
                      const team = teamByCode.get(teamCode)
                      const marker =
                        index === 0
                          ? markerMeta(row.firstResult)
                          : index === 1
                            ? markerMeta(row.secondResult)
                            : null
                      const isDragging = dragging?.groupId === row.groupId && dragging.code === teamCode
                      const isDragOver = dragOver?.groupId === row.groupId && dragOver.code === teamCode

                      return (
                        <div
                          key={`${row.groupId}-${teamCode}`}
                          draggable={!isDragDisabled}
                          className={cn(
                            'flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border bg-background/70 px-2.5 py-2.5 transition-colors',
                            !isDragDisabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                            isDragging ? 'opacity-70 ring-1 ring-ring/40' : undefined,
                            isDragOver ? 'border-ring/70 bg-background' : undefined
                          )}
                          onDragStart={(event) => handleDragStart(event, row, teamCode)}
                          onDragOver={(event) => handleDragOver(event, row, teamCode)}
                          onDrop={(event) => handleDrop(event, row, teamCode)}
                          onDragEnd={clearDragState}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-[11px] font-semibold text-muted-foreground">
                              {index + 1}
                            </span>
                            <TeamFlagLabelV2
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
                            {marker ? (
                              <span
                                title={marker.tooltip}
                                className={cn(
                                  'inline-flex items-center gap-1 whitespace-nowrap text-[12px] leading-none',
                                  placementTone(index === 0 ? row.firstResult : row.secondResult)
                                )}
                              >
                                <span aria-hidden="true">{marker.icon}</span>
                                <span>{marker.code}</span>
                              </span>
                            ) : null}
                            <span className="text-[12px] text-muted-foreground">{isDragDisabled ? 'Locked' : 'Drag to reorder'}</span>
                            <span className="font-mono text-[13px] leading-none text-muted-foreground" aria-hidden="true">
                              ::
                            </span>
                          </div>
                        </div>
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
      <div className="flex h-10 items-center gap-2 border-b border-border/60 px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-foreground">{meterLabel}</div>
        </div>

        <Badge tone={selectedCount < totalCount ? 'warning' : 'success'} className="h-6 rounded-full px-2 text-[12px] normal-case tracking-normal">
          {hintLabel}
        </Badge>

        {statusLabel ? (
          <Badge tone={statusLabel === 'Final' ? 'success' : statusLabel === 'Locked' ? 'locked' : 'warning'} className="h-6 rounded-full px-2 text-[12px] normal-case tracking-normal">
            {statusLabel}
          </Badge>
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
          <div className="group-stage-v2-best-third-grid grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {tiles.map((tile) => {
              const tileDisabled = isReadOnly || tile.disabled
              const showNotReady = tile.blockedReason === 'not-ready'
              const showCapReached = tile.blockedReason === 'cap'
              const statusText = bestThirdStatusText(tile.status)
              return (
                <button
                  key={`best-third-group-${tile.groupId}`}
                  type="button"
                  disabled={tileDisabled}
                  className={cn(
                    'group-stage-v2-best-third-tile rounded-lg border px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    bestThirdSurfaceClass(tile.status)
                  )}
                  data-selected={tile.selected ? 'true' : 'false'}
                  data-disabled={tileDisabled ? 'true' : 'false'}
                  data-animate={tile.animateSelection ? 'true' : 'false'}
                  onClick={() => onToggleGroup(tile.groupId)}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12px] uppercase tracking-wide text-muted-foreground">Group {tile.groupId}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {showNotReady ? 'Not ready' : showCapReached ? 'Limit reached' : tile.selected ? 'Selected' : ''}
                    </span>
                  </div>

                  <div className="min-h-11 rounded-lg border border-border bg-background px-2 py-2 text-[13px] text-foreground">
                    {showNotReady ? (
                      <span className="text-muted-foreground">Complete ranking 1-4 first.</span>
                    ) : (
                      <TeamFlagLabelV2
                        code={tile.teamCode}
                        name={tile.teamName}
                        label={tile.teamCode}
                        showName
                        className="max-w-full text-[13px]"
                        primaryClassName="font-semibold"
                      />
                    )}
                  </div>

                  {statusText ? <div className="mt-1.5 text-[12px] text-muted-foreground">{statusText}</div> : null}
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

type RightRailStickyProps = {
  children: ReactNode
}

export function RightRailSticky({ children }: RightRailStickyProps) {
  return <aside className="max-lg:static lg:sticky lg:top-[calc(var(--toolbar-h,56px)+var(--meta-h,32px)+20px)] lg:self-start">{children}</aside>
}

type LeaderboardCardCuratedProps = {
  rows: LeaderboardCardRow[]
  snapshotLabel: string
  topCount: 3 | 5
  title: string
  leaderboardPath?: string
  previewRowCount?: number
  priorityUserIds?: string[]
}

function movementLabel(movement: number | undefined): string {
  if (typeof movement !== 'number' || movement === 0) return '-'
  return movement > 0 ? `up ${movement}` : `down ${Math.abs(movement)}`
}

function normalizeIdentity(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase()
  return normalized ?? ''
}

function rowIdentityKeys(row: LeaderboardCardRow): string[] {
  const keys: string[] = []
  const idKey = normalizeIdentity(row.id)
  if (idKey) {
    keys.push(idKey)
    keys.push(`id:${idKey}`)
  }
  const nameKey = normalizeIdentity(row.name)
  if (nameKey) {
    keys.push(nameKey)
    keys.push(`name:${nameKey}`)
  }
  return keys
}

function buildFixedPreviewRows({
  rankedRows,
  previewRowCount,
  priorityUserIds
}: {
  rankedRows: LeaderboardCardRow[]
  previewRowCount: number
  priorityUserIds: string[]
}): LeaderboardCardRow[] {
  const selected: LeaderboardCardRow[] = []
  const seen = new Set<string>()

  const add = (row: LeaderboardCardRow | null | undefined) => {
    if (!row) return
    const keys = rowIdentityKeys(row)
    if (keys.length === 0) return
    if (keys.some((key) => seen.has(key))) return
    keys.forEach((key) => seen.add(key))
    selected.push(row)
  }

  rankedRows.filter((row) => row.isYou).forEach(add)
  for (const priorityId of priorityUserIds) {
    const key = normalizeIdentity(priorityId)
    if (!key) continue
    add(
      rankedRows.find((row) => {
        const rowId = normalizeIdentity(row.id)
        const rowName = normalizeIdentity(row.name)
        return rowId === key || rowName === key
      })
    )
    if (selected.length >= previewRowCount) return selected.slice(0, previewRowCount)
  }

  for (const row of rankedRows) {
    add(row)
    if (selected.length >= previewRowCount) break
  }

  const previewRows = selected.slice(0, previewRowCount)
  return [...previewRows].sort((a, b) => a.rank - b.rank)
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

function resolveRivalSlot(row: LeaderboardCardRow, priorityUserIds: string[]): number | null {
  if (row.isYou) return null
  const rowId = normalizeIdentity(row.id)
  const rowName = normalizeIdentity(row.name)

  for (let index = 0; index < priorityUserIds.length; index += 1) {
    const priorityKey = normalizeIdentity(priorityUserIds[index])
    if (!priorityKey) continue
    if (priorityKey === rowId || priorityKey === rowName) return index + 1
  }

  return null
}

export function LeaderboardCardCurated({
  rows,
  snapshotLabel,
  topCount,
  title,
  leaderboardPath,
  previewRowCount,
  priorityUserIds = []
}: LeaderboardCardCuratedProps) {
  const [showFull, setShowFull] = useState(false)

  const rankedRows = useMemo(() => [...rows].sort((a, b) => a.rank - b.rank), [rows])
  const shouldUseFixedPreview = typeof previewRowCount === 'number' && previewRowCount > 0
  const curatedRows = useMemo(() => curateRows(rankedRows, topCount), [rankedRows, topCount])
  const fixedPreviewRows = useMemo(() => {
    if (!shouldUseFixedPreview || !previewRowCount) return []
    return buildFixedPreviewRows({
      rankedRows,
      previewRowCount,
      priorityUserIds
    })
  }, [previewRowCount, priorityUserIds, rankedRows, shouldUseFixedPreview])
  const displayRows = showFull
    ? rankedRows
    : shouldUseFixedPreview
      ? fixedPreviewRows
      : curatedRows
  const previewPlaceholderCount =
    !showFull && shouldUseFixedPreview && previewRowCount ? Math.max(0, previewRowCount - displayRows.length) : 0
  const canShowFullToggle = shouldUseFixedPreview && previewRowCount ? rows.length > previewRowCount : rows.length > curatedRows.length

  return (
    <SectionCardV2 tone="panel" density="none" className="group-stage-v2-leaderboard rounded-xl overflow-hidden">
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border/60 px-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-foreground">{title}</div>
          <div className="truncate text-[12px] text-muted-foreground">
            {snapshotLabel === SNAPSHOT_UNAVAILABLE_LABEL ? snapshotLabel : `As of ${snapshotLabel}`}
          </div>
        </div>

        {canShowFullToggle ? (
          <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-[12px]" onClick={() => setShowFull((current) => !current)}>
            {showFull ? 'Hide full' : 'View full'}
          </Button>
        ) : null}
      </div>

      <div className={cn('space-y-1.5 p-3', showFull ? 'max-h-72 overflow-y-auto pr-1' : undefined)}>
        {displayRows.map((row) => {
          const rivalSlot = resolveRivalSlot(row, priorityUserIds)
          return (
            <div key={`leaderboard-row-wrap-${row.id}`}>
              <div
                className={cn(
                  'flex min-h-11 items-center justify-between rounded-lg border border-border px-3 text-[13px] transition-colors hover:bg-background/70',
                  row.isYou
                    ? 'bg-background/80 ring-1 ring-ring/50'
                    : rivalSlot
                      ? 'bg-[rgba(var(--secondary-rgb),0.08)] ring-1 ring-[rgba(var(--secondary-rgb),0.35)]'
                      : 'bg-background/35'
                )}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">#{row.rank} {row.name}</div>
                  <div className="text-[12px] text-muted-foreground">
                    Move {movementLabel(row.movement)}
                    {row.isYou ? (
                      <span className="ml-1 rounded-full border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.12em]">You</span>
                    ) : rivalSlot ? (
                      <span className="ml-1 rounded-full border border-border px-1 py-0.5 text-[10px] uppercase tracking-[0.12em]">
                        Rival {rivalSlot}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-right text-[12px] text-muted-foreground">
                  <div className="tabular-nums text-foreground">{row.points} pts</div>
                  {typeof row.deltaPoints === 'number' ? (
                    <div className="tabular-nums">{row.deltaPoints >= 0 ? '+' : ''}{row.deltaPoints}</div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
        {previewPlaceholderCount > 0
          ? Array.from({ length: previewPlaceholderCount }, (_, index) => (
              <div
                key={`leaderboard-row-placeholder-${index}`}
                className="flex min-h-11 items-center rounded-lg border border-dashed border-border/50 bg-background/20 px-3"
                aria-hidden="true"
              >
                <div className="h-2 w-24 rounded bg-border/60" />
              </div>
            ))
          : null}

        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/35 px-3 py-2 text-[13px] text-muted-foreground">
            No leaderboard snapshot rows available.
          </div>
        ) : null}
      </div>

      {leaderboardPath ? (
        <div className="border-t border-border/60 px-3 py-2">
          <ButtonLink to={leaderboardPath} size="sm" variant="secondary" className="h-8 rounded-lg px-2 text-[12px]">
            Open leaderboard
          </ButtonLink>
        </div>
      ) : null}
    </SectionCardV2>
  )
}
