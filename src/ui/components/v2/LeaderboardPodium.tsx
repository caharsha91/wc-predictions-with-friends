import { ButtonLink } from '../ui/Button'
import { useRouteDataMode } from '../../hooks/useRouteDataMode'
import { cn } from '../../lib/utils'
import MemberAvatarV2 from './MemberAvatarV2'

export type LeaderboardPodiumRow = {
  id: string
  name: string
  points: number | null
  rank: 1 | 2 | 3
  favoriteTeamCode?: string | null
  isViewer?: boolean
}

type LeaderboardPodiumProps = {
  rows: LeaderboardPodiumRow[]
  snapshotAvailable: boolean
  className?: string
  showCta?: boolean
}

type PodiumSlot = {
  rank: 1 | 2 | 3
  row: LeaderboardPodiumRow | null
}

function slotByRank(rows: LeaderboardPodiumRow[], rank: 1 | 2 | 3): PodiumSlot {
  return { rank, row: rows.find((row) => row.rank === rank) ?? null }
}

export default function LeaderboardPodium({ rows, snapshotAvailable, className, showCta = true }: LeaderboardPodiumProps) {
  const mode = useRouteDataMode()
  const leaderboardPath = mode === 'demo' ? '/demo/leaderboard' : '/leaderboard'

  const leftSlot = slotByRank(rows, 2)
  const centerSlot = slotByRank(rows, 1)
  const rightSlot = slotByRank(rows, 3)
  const orderedSlots = [leftSlot, centerSlot, rightSlot]

  return (
    <section
      className={cn('landing-v2-podium rounded-xl border p-3 md:p-4', className)}
      aria-label="Leaderboard podium"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Podium race</div>
        <span className="rounded-full border border-border/70 bg-background/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Top 3
        </span>
      </div>

      {!snapshotAvailable ? <div className="mt-2 text-[13px] text-muted-foreground">Snapshot unavailable</div> : null}

      <div className="landing-v2-podium-race-grid mt-3 grid grid-cols-3 items-end gap-2 md:gap-3">
        {orderedSlots.map((slot) => (
          <article
            key={`podium-race-${slot.rank}-${slot.row?.id ?? 'empty'}`}
            className="landing-v2-podium-race-tile rounded-3xl border p-3 md:p-4"
            data-rank={slot.rank}
            data-viewer={slot.row?.isViewer ? 'true' : 'false'}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">#{slot.rank}</div>
              <div className="flex items-center gap-1.5">
                {slot.row ? (
                  <MemberAvatarV2
                    name={slot.row.name}
                    favoriteTeamCode={slot.row.favoriteTeamCode}
                    size="sm"
                    className="h-12 w-[72px]"
                  />
                ) : null}
                {slot.row?.isViewer ? <span className="landing-v2-podium-you-badge">You</span> : null}
              </div>
            </div>
            <div className="mt-2 truncate text-2xl font-semibold leading-tight text-[color:var(--v2-text-strong)] md:text-3xl">
              {slot.row?.name ?? '—'}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-semibold leading-none text-[color:var(--v2-text-strong)] md:text-[2.6rem]">
                {slot.row?.points ?? 0}
              </span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">pts</span>
            </div>
          </article>
        ))}
      </div>

      {showCta ? (
        <div className="mt-3">
          <ButtonLink
            to={leaderboardPath}
            variant="secondary"
            size="sm"
            className="h-9 rounded-full px-3 text-[12px]"
          >
            View full leaderboard
          </ButtonLink>
        </div>
      ) : null}
    </section>
  )
}
