import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchLeaderboard } from '../../lib/data'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { LEADERBOARD_LIST_PAGE_SIZE } from '../constants/pagination'
import { useAuthState } from '../hooks/useAuthState'
import { useRouteDataMode } from '../hooks/useRouteDataMode'
import { useViewerId } from '../hooks/useViewerId'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import DetailsDisclosure from '../components/ui/DetailsDisclosure'
import PageHeroPanel from '../components/ui/PageHeroPanel'
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
  const navigate = useNavigate()
  const userId = useViewerId()
  const authState = useAuthState()
  const mode = useRouteDataMode()
  const [page, setPage] = useState(1)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const viewerKeys = useMemo(() => {
    const keys = new Set<string>()
    if (userId) keys.add(userId.toLowerCase())
    const authUid = authState.user?.uid
    if (authUid) keys.add(authUid.toLowerCase())
    const authEmail = authState.user?.email?.toLowerCase()
    if (authEmail) keys.add(authEmail)
    return keys
  }, [authState.user?.email, authState.user?.uid, userId])

  function isCurrentUserEntry(entry: LeaderboardEntry): boolean {
    const memberId = entry.member.id?.toLowerCase()
    const memberEmail = entry.member.email?.toLowerCase()
    return (
      (memberId ? viewerKeys.has(memberId) : false) ||
      (memberEmail ? viewerKeys.has(memberEmail) : false)
    )
  }

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const file = await fetchLeaderboard({ mode })
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
  }, [mode])

  const summary = useMemo(() => {
    if (state.status !== 'ready') return null
    const leader = state.entries[0] ?? null
    const currentRank = state.entries.findIndex((entry) => isCurrentUserEntry(entry)) + 1
    const current = currentRank > 0 ? state.entries[currentRank - 1] : null
    const count = state.entries.length
    const avg = (value: number) => (count > 0 ? Math.round(value / count) : 0)
    const sumTotal = state.entries.reduce((sum, entry) => sum + entry.totalPoints, 0)
    const sumExact = state.entries.reduce((sum, entry) => sum + entry.exactPoints, 0)
    const sumOutcome = state.entries.reduce((sum, entry) => sum + entry.resultPoints, 0)
    const sumKo = state.entries.reduce((sum, entry) => sum + entry.knockoutPoints, 0)
    const sumBracket = state.entries.reduce((sum, entry) => sum + entry.bracketPoints, 0)

    const maxBy = (selector: (entry: LeaderboardEntry) => number) => {
      if (state.entries.length === 0) return null
      return state.entries.reduce((best, entry) => (selector(entry) > selector(best) ? entry : best), state.entries[0])
    }
    const maxTotal = maxBy((entry) => entry.totalPoints)
    const maxExact = maxBy((entry) => entry.exactPoints)
    const maxOutcome = maxBy((entry) => entry.resultPoints)
    const maxKo = maxBy((entry) => entry.knockoutPoints)
    const maxBracket = maxBy((entry) => entry.bracketPoints)

    const scoringPlayers = state.entries.filter((entry) => entry.totalPoints > 0).length
    const lastPlacePoints = state.entries[state.entries.length - 1]?.totalPoints ?? 0
    const spread = leader ? leader.totalPoints - lastPlacePoints : 0
    const gapToLeader = leader && current ? Math.max(0, leader.totalPoints - current.totalPoints) : null
    let nearestRivalGap: number | null = null
    if (current && currentRank > 0) {
      const above = state.entries[currentRank - 2]
      const below = state.entries[currentRank]
      const gaps: number[] = []
      if (above) gaps.push(Math.abs(above.totalPoints - current.totalPoints))
      if (below) gaps.push(Math.abs(current.totalPoints - below.totalPoints))
      nearestRivalGap = gaps.length > 0 ? Math.min(...gaps) : 0
    }
    const actionableInsightTitle =
      scoringPlayers === 0
        ? 'No scoring yet'
        : current
          ? 'Race update'
          : 'No rank yet'
    const actionableInsightDetail =
      scoringPlayers === 0
        ? 'Submit picks for the next lock window.'
        : current
          ? `Gap to leader: ${gapToLeader ?? 0} pts · Nearest rival gap: ${nearestRivalGap ?? 0} pts`
          : 'Complete your first picks to enter standings.'
    return {
      players: state.entries.length,
      leader,
      current,
      currentRank: currentRank > 0 ? currentRank : null,
      actionableInsightTitle,
      actionableInsightDetail,
      nearestRivalGap,
      averages: {
        total: avg(sumTotal),
        exact: avg(sumExact),
        outcome: avg(sumOutcome),
        ko: avg(sumKo),
        bracket: avg(sumBracket)
      },
      maxima: {
        total: maxTotal ? { value: maxTotal.totalPoints, name: maxTotal.member.name } : null,
        exact: maxExact ? { value: maxExact.exactPoints, name: maxExact.member.name } : null,
        outcome: maxOutcome ? { value: maxOutcome.resultPoints, name: maxOutcome.member.name } : null,
        ko: maxKo ? { value: maxKo.knockoutPoints, name: maxKo.member.name } : null,
        bracket: maxBracket ? { value: maxBracket.bracketPoints, name: maxBracket.member.name } : null
      },
      scoringPlayers,
      spread,
      gapToLeader
    }
  }, [state, viewerKeys])

  function openAdvancedMetrics() {
    setAdvancedOpen(true)
    if (typeof document === 'undefined') return
    const node = document.getElementById('league-advanced-metrics')
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    setPage(1)
  }, [state.status === 'ready' ? state.entries.length : 0])

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

  const totalPages = Math.max(1, Math.ceil(state.entries.length / LEADERBOARD_LIST_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * LEADERBOARD_LIST_PAGE_SIZE
  const pageRows = state.entries.slice(start, start + LEADERBOARD_LIST_PAGE_SIZE)

  return (
    <div className="space-y-6">
      <PageHeroPanel
        kicker="Standings"
        title="Leaderboard"
        subtitle="Read-only standings from the daily offline scoring pipeline."
        meta={
          <div className="text-right text-xs text-muted-foreground" data-last-updated="true">
            <div className="uppercase tracking-[0.2em]">Last updated</div>
            <div className="text-sm font-semibold text-foreground">{formatTime(state.lastUpdated)}</div>
          </div>
        }
      >
        {summary ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="rounded-2xl border-border/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Leader</div>
                <Badge tone="secondary">#1</Badge>
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {summary.leader ? summary.leader.member.name : '—'}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {summary.leader ? `${summary.leader.totalPoints} pts` : '—'}
              </div>
              {summary.leader ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Exact {summary.leader.exactPoints} · Outcome {summary.leader.resultPoints} · KO{' '}
                  {summary.leader.knockoutPoints} · Bracket {summary.leader.bracketPoints}
                </div>
              ) : null}
            </Card>

            <Card className="rounded-2xl border-border/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your stats</div>
                {summary.current ? <Badge tone="info">You</Badge> : null}
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {summary.currentRank ? `#${summary.currentRank}` : 'No entry'}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {summary.current ? `${summary.current.totalPoints} pts` : 'No leaderboard row yet'}
              </div>
              {summary.current ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Exact {summary.current.exactPoints} · Outcome {summary.current.resultPoints} · KO{' '}
                  {summary.current.knockoutPoints} · Bracket {summary.current.bracketPoints}
                </div>
              ) : null}
              {summary.gapToLeader !== null ? (
                <div className="mt-2 text-xs text-muted-foreground">Gap to leader: {summary.gapToLeader} pts</div>
              ) : null}
            </Card>

            <Card className="rounded-2xl border-border/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">League metrics</div>
              <div className="mt-2 text-sm text-foreground">Players: {summary.players}</div>
              <div className="mt-1 text-sm text-foreground">Scoring players: {summary.scoringPlayers}</div>
              <div className="mt-1 text-sm text-foreground">Average points: {summary.averages.total}</div>
              <div className="mt-1 text-sm text-foreground">Top-to-bottom spread: {summary.spread}</div>
            </Card>

            <Card className="rounded-2xl border-border/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Actionable insight</div>
              <div className="mt-2 text-sm font-semibold text-foreground">{summary.actionableInsightTitle}</div>
              <div className="mt-1 text-sm text-foreground">{summary.actionableInsightDetail}</div>
            </Card>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => navigate('/play/picks')}>Improve next round</Button>
          <Button variant="secondary" onClick={openAdvancedMetrics}>
            Open advanced metrics
          </Button>
        </div>
      </PageHeroPanel>

      <Card className="rounded-2xl border-border/60 p-4 sm:p-5">
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
            {pageRows.map((entry, index) => {
              const rank = start + index + 1
              const isYou = isCurrentUserEntry(entry)
              const rowClass = isYou ? 'bg-[var(--accent-soft)]/60' : ''
              return (
                <tr key={entry.member.id} className={rowClass}>
                  <td>#{rank}</td>
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

        {state.entries.length > LEADERBOARD_LIST_PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Showing {start + 1}-{Math.min(start + LEADERBOARD_LIST_PAGE_SIZE, state.entries.length)} of {state.entries.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Prev
              </Button>
              <div className="text-xs text-muted-foreground">
                Page {safePage} / {totalPages}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {summary ? (
        <div id="league-advanced-metrics">
          <DetailsDisclosure title="League distribution details" className="scroll-mt-5" defaultOpen={advancedOpen}>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl border-border/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Section averages</div>
              <div className="mt-2 text-sm text-foreground">Total: {summary.averages.total}</div>
              <div className="mt-1 text-sm text-foreground">Exact: {summary.averages.exact}</div>
              <div className="mt-1 text-sm text-foreground">Outcome: {summary.averages.outcome}</div>
              <div className="mt-1 text-sm text-foreground">KO: {summary.averages.ko}</div>
              <div className="mt-1 text-sm text-foreground">Bracket: {summary.averages.bracket}</div>
            </Card>
            <Card className="rounded-2xl border-border/60 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Section maxima</div>
              <div className="mt-2 text-sm text-foreground">
                Total: {summary.maxima.total?.value ?? 0} ({summary.maxima.total?.name ?? '—'})
              </div>
              <div className="mt-1 text-sm text-foreground">
                Exact: {summary.maxima.exact?.value ?? 0} ({summary.maxima.exact?.name ?? '—'})
              </div>
              <div className="mt-1 text-sm text-foreground">
                Outcome: {summary.maxima.outcome?.value ?? 0} ({summary.maxima.outcome?.name ?? '—'})
              </div>
              <div className="mt-1 text-sm text-foreground">
                KO: {summary.maxima.ko?.value ?? 0} ({summary.maxima.ko?.name ?? '—'})
              </div>
              <div className="mt-1 text-sm text-foreground">
                Bracket: {summary.maxima.bracket?.value ?? 0} ({summary.maxima.bracket?.name ?? '—'})
              </div>
            </Card>
          </div>
          </DetailsDisclosure>
        </div>
      ) : null}
    </div>
  )
}
