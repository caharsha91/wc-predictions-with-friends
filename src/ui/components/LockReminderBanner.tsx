import { useMemo } from 'react'

import { getDateKeyInTimeZone, getLockTime } from '../../lib/matches'
import type { Match } from '../../types/matches'
import { useNow } from '../hooks/useNow'

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

function formatLockTimeShort(lockTime: Date) {
  return lockTime.toLocaleTimeString(undefined, {
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
}

export default function LockReminderBanner({ matches }: LockReminderBannerProps) {
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
  const sameDayMatches = matches
    .filter((entry) => entry.status !== 'FINISHED')
    .filter((entry) => getDateKeyInTimeZone(entry.kickoffUtc) === dateKey)
    .sort((a, b) => new Date(a.kickoffUtc).getTime() - new Date(b.kickoffUtc).getTime())

  return (
    <section className="card validationBanner lockBanner" role="status">
      <div className="validationBannerInfo lockBannerInfo">
        <div className="validationBannerTitle">Upcoming lock</div>
        <div className="lockBannerMatch">
          {match.homeTeam.code} vs {match.awayTeam.code}
        </div>
        <div className="validationBannerMeta">
          {match.stage} · Locks at {formatLockTime(lockTime)}
        </div>
        <div className="lockBannerNote">Edits lock at kickoff.</div>
        {sameDayMatches.length > 1 ? (
          <div className="lockBannerMatches">
            <div className="lockBannerMatchesTitle">Also locking today</div>
            <div className="lockBannerMatchesList">
              {sameDayMatches.map((entry) => (
                <div key={entry.id} className="lockBannerMatchItem">
                  <span className="lockBannerMatchTime">
                    {formatLockTimeShort(getLockTime(entry.kickoffUtc))}
                  </span>
                  <span>
                    {entry.homeTeam.code} vs {entry.awayTeam.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="lockBannerCountdown">
        <div className="lockBannerCountdownLabel">Locking in</div>
        <div className="lockBannerCountdownValue">{countdown}</div>
      </div>
    </section>
  )
}
