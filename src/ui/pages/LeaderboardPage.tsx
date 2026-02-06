import { useEffect, useMemo, useState } from 'react'

import { fetchLeaderboard } from '../../lib/data'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { useViewerId } from '../hooks/useViewerId'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'
import Table from '../components/ui/Table'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      entries: LeaderboardEntry[]
      lastUpdated: string
    }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function LeaderboardPage() {
  const userId = useViewerId()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const file = await fetchLeaderboard()
        if (canceled) return
        const sorted = [...file.entries].sort((a, b) => b.totalPoints - a.totalPoints)
        setState({
          status: 'ready',
          entries: sorted,
          lastUpdated: file.lastUpdated
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!canceled) setState({ status: 'error', message })
      }
    }
    void load()
    return () => {
      canceled = true
    }
  }, [])

  const summary = useMemo(() => {
    if (state.status !== 'ready') return null
    const leader = state.entries[0]
    const currentRank = state.entries.findIndex((entry) => entry.member.id === userId) + 1
    const current = currentRank > 0 ? state.entries[currentRank - 1] : null
    return {
      players: state.entries.length,
      leader,
      current,
      currentRank: currentRank > 0 ? currentRank : null
    }
  }, [state, userId])

  if (state.status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <Alert tone="danger" title="Unable to load leaderboard">
        {state.message}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Standings"
        title="Leaderboard"
        subtitle="Read-only standings from the daily offline scoring pipeline."
        actions={
          <div className="text-right text-xs text-muted-foreground">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(state.lastUpdated)}</div>
          </div>
        }
      />

      {summary ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Players</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{summary.players}</div>
          </Card>
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Leader</div>
            <div className="mt-2 text-sm font-semibold text-foreground">
              {summary.leader ? summary.leader.member.name : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.leader ? `${summary.leader.totalPoints} pts` : '—'}
            </div>
          </Card>
          <Card className="rounded-2xl border-border/60 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your rank</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {summary.currentRank ? `#${summary.currentRank}` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary.current ? `${summary.current.totalPoints} pts` : 'No entry'}
            </div>
          </Card>
        </div>
      ) : null}

      <Table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Total</th>
            <th>Exact</th>
            <th>Outcome</th>
            <th>KO</th>
            <th>Bracket</th>
          </tr>
        </thead>
        <tbody>
          {state.entries.map((entry, index) => {
            const isYou = entry.member.id === userId
            return (
              <tr key={entry.member.id} className={isYou ? 'bg-[var(--accent-soft)]/60' : ''}>
                <td>#{index + 1}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{entry.member.name}</span>
                    {isYou ? <Badge tone="info">You</Badge> : null}
                  </div>
                </td>
                <td className="font-semibold text-foreground">{entry.totalPoints}</td>
                <td>{entry.exactPoints}</td>
                <td>{entry.resultPoints}</td>
                <td>{entry.knockoutPoints}</td>
                <td>{entry.bracketPoints}</td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}
