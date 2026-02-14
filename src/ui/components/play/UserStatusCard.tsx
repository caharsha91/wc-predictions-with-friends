import type { LeaderboardUserContext } from '../../lib/leaderboardContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import PanelState from '../ui/PanelState'

function formatRivalryLine(context: LeaderboardUserContext): { text: string; tone: 'warning' | 'success' | 'info' } {
  const current = context.current.entry
  const rival = context.above ?? context.below
  if (!rival) return { text: 'No nearby rival yet. Hold your position.', tone: 'info' }

  const gap = Math.abs(rival.entry.totalPoints - current.totalPoints)
  if (gap === 0) {
    return { text: `Tied with @${rival.entry.member.name}`, tone: 'info' }
  }

  if (rival.rank < context.current.rank) {
    return { text: `${gap} pts behind @${rival.entry.member.name}`, tone: 'warning' }
  }
  return { text: `${gap} pts ahead of @${rival.entry.member.name}`, tone: 'success' }
}

export default function UserStatusCard({
  context,
  onOpenLeague
}: {
  context: LeaderboardUserContext | null
  onOpenLeague: () => void
}) {
  const rivalry = context ? formatRivalryLine(context) : null

  return (
    <Card className="rounded-2xl border-border/60 p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your status</div>
          <Button size="sm" variant="secondary" onClick={onOpenLeague}>
            Open Leaderboard
          </Button>
        </div>

        {context ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-bg2/45 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Rank</div>
                <div className="mt-1 text-xl font-black text-foreground">#{context.current.rank}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-bg2/45 p-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Points</div>
                <div className="mt-1 text-xl font-black text-foreground">{context.current.entry.totalPoints}</div>
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-transparent p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Rivalry strip</div>
                <Badge tone={rivalry?.tone ?? 'info'}>{rivalry?.text ?? 'No rivalry data yet'}</Badge>
              </div>
            </div>
          </>
        ) : (
          <PanelState
            className="text-xs"
            message="Rank appears after the leaderboard includes your account."
            tone="empty"
          />
        )}
      </div>
    </Card>
  )
}
