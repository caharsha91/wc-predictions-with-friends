import { useMemo, type ReactNode } from 'react'

import { SNAPSHOT_METADATA_PREFIX } from '../../lib/pageStatusCopy'
import { resolveSemanticState } from '../../lib/semanticState'
import { SNAPSHOT_UNAVAILABLE_LABEL } from '../../lib/snapshotStamp'
import { ButtonLink } from '../ui/Button'
import MemberIdentityRowV2 from './MemberIdentityRowV2'
import RowShellV2 from './RowShellV2'
import SideListPanelV2 from './SideListPanelV2'
import StatusTagV2 from './StatusTagV2'

export type LeaderboardCardRow = {
  id: string
  name: string
  rank: number
  points: number
  movement?: number
  deltaPoints?: number
  isYou: boolean
  favoriteTeamCode?: string | null
}

type RightRailStickyProps = {
  children: ReactNode
}

type LeaderboardCardCuratedProps = {
  rows: LeaderboardCardRow[]
  snapshotLabel?: string
  topCount: 3 | 5
  title: string
  leaderboardPath?: string
  previewRowCount?: number
  priorityUserIds?: string[]
}

export function RightRailSticky({ children }: RightRailStickyProps) {
  return <aside className="max-lg:static lg:sticky lg:top-[calc(var(--v2-sticky-offset)+12px)] lg:self-start">{children}</aside>
}

function movementLabel(movement: number | undefined): string {
  if (typeof movement !== 'number' || movement === 0) return '-'
  return movement > 0 ? `up ${movement}` : `down ${Math.abs(movement)}`
}

function rankLabel(rank: number, tieCount: number): string {
  if (tieCount > 1) return `T#${rank}`
  return `#${rank}`
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
  const displayRows = shouldUseFixedPreview
    ? fixedPreviewRows
    : curatedRows
  const tieCountByRank = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of rankedRows) {
      counts.set(row.rank, (counts.get(row.rank) ?? 0) + 1)
    }
    return counts
  }, [rankedRows])
  const previewPlaceholderCount =
    shouldUseFixedPreview && previewRowCount ? Math.max(0, previewRowCount - displayRows.length) : 0

  return (
    <SideListPanelV2
      title={title}
      subtitle={
        !snapshotLabel
          ? undefined
          : snapshotLabel === SNAPSHOT_UNAVAILABLE_LABEL
            ? SNAPSHOT_UNAVAILABLE_LABEL
            : `${SNAPSHOT_METADATA_PREFIX}${snapshotLabel}`
      }
      className="group-stage-v2-leaderboard"
      contentClassName="v2-list-divider space-y-0"
      footer={
        leaderboardPath ? (
          <ButtonLink to={leaderboardPath} size="xs" variant="tertiary" className="h-7 rounded-md px-2">
            Open leaderboard
          </ButtonLink>
        ) : undefined
      }
    >
      {displayRows.map((row) => {
        const rivalSlot = resolveRivalSlot(row, priorityUserIds)
        const rowState = resolveSemanticState({
          you: row.isYou,
          rival: !row.isYou && Boolean(rivalSlot)
        })
        const tieCount = tieCountByRank.get(row.rank) ?? 1

        return (
          <RowShellV2
            key={`leaderboard-row-wrap-${row.id}`}
            depth={row.isYou ? 'prominent' : 'embedded'}
            state={rowState}
            className="min-h-11 px-2 py-1.5"
            interactive
          >
            <MemberIdentityRowV2
              name={`${rankLabel(row.rank, tieCount)} ${row.name}`}
              favoriteTeamCode={row.favoriteTeamCode ?? null}
              avatarClassName="h-12 w-[72px] shrink-0"
              nameBadges={
                row.isYou ? (
                  <StatusTagV2 tone="info" className="v2-role-badge">You</StatusTagV2>
                ) : rivalSlot ? (
                  <StatusTagV2 tone="warning" className="v2-role-badge">{`Rival ${rivalSlot}`}</StatusTagV2>
                ) : null
              }
              subtitle={(
                <span>
                  Move {movementLabel(row.movement)}
                  {row.deltaPoints !== undefined && typeof row.deltaPoints === 'number'
                    ? ` • ${row.deltaPoints >= 0 ? '+' : ''}${row.deltaPoints}`
                    : ''}
                </span>
              )}
              marker={(
                <div className="text-right v2-type-caption">
                  <div className="tabular-nums text-foreground">{row.points} pts</div>
                  {typeof row.deltaPoints === 'number' ? (
                    <div className="tabular-nums">{row.deltaPoints >= 0 ? '+' : ''}{row.deltaPoints}</div>
                  ) : null}
                </div>
              )}
            />
          </RowShellV2>
        )
      })}

      {previewPlaceholderCount > 0
        ? Array.from({ length: previewPlaceholderCount }, (_, index) => (
            <RowShellV2
              key={`leaderboard-row-placeholder-${index}`}
              depth="embedded"
              tone="inset"
              state="disabled"
              interactive={false}
              className="min-h-11 px-2 py-1.5"
              aria-hidden="true"
            >
              <div className="h-2 w-24 rounded bg-border/60" />
            </RowShellV2>
          ))
        : null}

      {rows.length === 0 ? (
        <RowShellV2 depth="embedded" tone="inset" interactive={false} className="v2-type-meta">
          No leaderboard rows are available in the latest snapshot.
        </RowShellV2>
      ) : null}
    </SideListPanelV2>
  )
}
