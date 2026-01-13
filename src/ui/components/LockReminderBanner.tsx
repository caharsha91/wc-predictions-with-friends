import { useMemo } from 'react'

import { getDateKeyInTimeZone, getLockTime, isMatchLocked } from '../../lib/matches'
import { findPick, isPickComplete } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import { useNow } from '../hooks/useNow'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

type UpcomingLock = {
  match: Match
  lockTime: Date
}

function formatLockTime(lockTime: Date) {
  return lockTime.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatCountdown(target: Date, now: Date) {
  const diffMs = Math.max(0, target.getTime() - now.getTime())
  const totalSeconds = Math.floor(diffMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  }
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

type LockReminderBannerProps = {
  matches: Match[]
  picks?: Pick[]
  userId?: string
  onJumpToMatchday?: (dateKey: string) => void
  onOpenMatch?: (matchId: string) => void
}

export default function LockReminderBanner({
  matches,
  picks,
  userId,
  onJumpToMatchday,
  onOpenMatch
}: LockReminderBannerProps) {
  const now = useNow({ tickMs: 1000 })

  const upcomingLock = useMemo<UpcomingLock | null>(() => {
    const candidates = matches
      .filter((match) => match.status !== 'FINISHED')
      .map((match) => ({ match, lockTime: getLockTime(match.kickoffUtc) }))
      .filter((entry) => entry.lockTime.getTime() > now.getTime())
      .sort((a, b) => a.lockTime.getTime() - b.lockTime.getTime())
    return candidates[0] ?? null
  }, [matches, now])

  if (!upcomingLock) return null

  const { match, lockTime } = upcomingLock
  const countdown = formatCountdown(lockTime, now)
  const dateKey = getDateKeyInTimeZone(match.kickoffUtc)
  const matchdayId = `matchday-${dateKey}`
  const pick = picks && userId ? findPick(picks, match.id, userId) : undefined
  const picked = pick ? isPickComplete(match, pick) : false
  const locked = isMatchLocked(match.kickoffUtc, now)
  const statusLabel = picked ? 'Picked' : locked ? 'Locked' : 'Missing'
  const badgeTone = picked ? 'success' : locked ? 'locked' : 'warning'
  const actionLabel = picked ? 'Review pick' : locked ? 'View match' : 'Make pick'

  function handleJumpToMatchday() {
    if (onOpenMatch) {
      onOpenMatch(match.id)
      return
    }
    if (onJumpToMatchday) {
      onJumpToMatchday(dateKey)
      return
    }
    const target = document.getElementById(matchdayId)
    if (!target) return
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <Card as="section" className="p-5" role="status">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Next lock</div>
          <div className="text-lg font-semibold text-foreground">
            {match.homeTeam.code} vs {match.awayTeam.code}
          </div>
          <div className="text-xs text-muted-foreground">
            {match.stage} · Locks at {formatLockTime(lockTime)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-end gap-1 text-right">
            <div className="text-xs text-muted-foreground">Locks in</div>
            <div className="text-sm font-semibold text-foreground">{countdown}</div>
          </div>
          <Badge tone={badgeTone}>{statusLabel}</Badge>
          <Button type="button" size="sm" variant="pill" onClick={handleJumpToMatchday}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
