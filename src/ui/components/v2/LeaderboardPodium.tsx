import { ButtonLink } from '../ui/Button'
import { cn } from '../../lib/utils'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import ProfileAvatar from './ProfileAvatar'

export type LeaderboardPodiumRow = {
  id: string
  name: string
  points: number | null
  rank: 1 | 2 | 3
  photoURL?: string | null
  isViewer?: boolean
}

type LeaderboardPodiumProps = {
  rows: LeaderboardPodiumRow[]
  snapshotAvailable: boolean
  className?: string
}

type PodiumSlot = {
  rank: 1 | 2 | 3
  row: LeaderboardPodiumRow | null
}

function slotByRank(rows: LeaderboardPodiumRow[], rank: 1 | 2 | 3): PodiumSlot {
  return { rank, row: rows.find((row) => row.rank === rank) ?? null }
}

function SlotAvatar({ slot }: { slot: PodiumSlot }) {
  if (!slot.row) {
    return <div className="h-12 w-12 rounded-full border border-dashed border-border/60 bg-background/25 md:h-14 md:w-14" />
  }

  return (
    <div className="landing-v2-podium-avatar-halo" data-rank={slot.rank}>
      <ProfileAvatar
        name={slot.row.name}
        photoURL={slot.row.photoURL ?? null}
        className={cn('h-12 w-12 md:h-14 md:w-14', slot.rank === 1 && 'h-14 w-14 md:h-16 md:w-16')}
      />
    </div>
  )
}

function SlotRankPill({ rank }: { rank: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-background/45 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      #{rank}
    </span>
  )
}

function SlotMeta({ slot }: { slot: PodiumSlot }) {
  if (!slot.row) {
    return (
      <div className="min-h-[2.4rem] text-center">
        <div className="text-xs text-muted-foreground">—</div>
      </div>
    )
  }

  return (
    <div className="min-h-[2.4rem] text-center">
      <div className="truncate text-xs font-semibold text-[color:var(--v2-text-strong)] md:text-sm">{slot.row.name}</div>
      <div className="text-[11px] text-muted-foreground">{slot.row.points ?? '—'} pts</div>
    </div>
  )
}

function SlotPedestal({ slot }: { slot: PodiumSlot }) {
  return (
    <div
      className={cn(
        'landing-v2-podium-pedestal flex items-center justify-center rounded-t-lg border border-b-0 text-lg font-semibold text-foreground md:text-2xl',
        slot.rank === 1 && 'h-[6rem] md:h-[7.5rem]',
        slot.rank === 2 && 'h-[4.3rem] md:h-[5.4rem]',
        slot.rank === 3 && 'h-[3.7rem] md:h-[4.8rem]'
      )}
      data-rank={slot.rank}
      aria-label={`Podium rank ${slot.rank}`}
    >
      {slot.rank}
    </div>
  )
}

export default function LeaderboardPodium({ rows, snapshotAvailable, className }: LeaderboardPodiumProps) {
  const mode = useRouteDataMode()
  const leaderboardPath = mode === 'demo' ? '/demo/leaderboard' : '/leaderboard'

  const leftSlot = slotByRank(rows, 2)
  const centerSlot = slotByRank(rows, 1)
  const rightSlot = slotByRank(rows, 3)
  const orderedSlots = [leftSlot, centerSlot, rightSlot]

  const hasAnyRows = rows.length > 0

  return (
    <section
      className={cn('landing-v2-podium rounded-xl border p-3 md:p-4', className)}
      aria-label="Leaderboard podium"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Top podium</div>
        <span className="rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Top 3
        </span>
      </div>

      {!snapshotAvailable ? <div className="mt-2 text-xs text-muted-foreground">Snapshot unavailable</div> : null}

      {hasAnyRows ? (
        <div className="landing-v2-podium-scene mt-3">
          <div className="grid grid-cols-3 items-end gap-2 px-1 md:gap-3 md:px-2">
            {orderedSlots.map((slot) => (
              <div
                key={`podium-avatar-${slot.rank}-${slot.row?.id ?? 'empty'}`}
                className={cn('flex flex-col items-center justify-end gap-1', slot.rank === 1 ? 'pb-1 md:pb-2' : 'pb-0')}
              >
                <SlotRankPill rank={slot.rank} />
                <SlotAvatar slot={slot} />
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-3 items-end gap-2 md:gap-3">
            {orderedSlots.map((slot) => (
              <SlotPedestal key={`podium-block-${slot.rank}-${slot.row?.id ?? 'empty'}`} slot={slot} />
            ))}
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 md:gap-3">
            {orderedSlots.map((slot) => (
              <SlotMeta key={`podium-meta-${slot.rank}-${slot.row?.id ?? 'empty'}`} slot={slot} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <ButtonLink
          to={leaderboardPath}
          variant="secondary"
          size="sm"
          className="h-8 rounded-full px-3 text-[11px]"
        >
          View full leaderboard
        </ButtonLink>
      </div>
    </section>
  )
}
