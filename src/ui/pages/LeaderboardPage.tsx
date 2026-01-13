import { useEffect, useMemo, useState } from 'react'

import { fetchLeaderboard } from '../../lib/data'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { useViewerId } from '../hooks/useViewerId'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import Skeleton from '../components/ui/Skeleton'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      leaderboard: LeaderboardEntry[]
      lastUpdated: string
    }

function formatUpdatedAt(iso: string) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function LeaderboardPage() {
  const userId = useViewerId()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [page, setPage] = useState(1)
  const basePageSize = 5

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const leaderboardFile = await fetchLeaderboard()
        if (canceled) return
        setState({
          status: 'ready',
          leaderboard: leaderboardFile.entries,
          lastUpdated: leaderboardFile.lastUpdated
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
  }, [userId])

  const leaderboard = useMemo(() => {
    if (state.status !== 'ready') return []
    return state.leaderboard
  }, [state])

  const leaderboardSummary = useMemo(() => {
    const totals = {
      total: 0,
      exact: 0,
      outcome: 0,
      knockout: 0,
      bracket: 0
    }
    for (const entry of leaderboard) {
      totals.total += entry.totalPoints
      totals.exact += entry.exactPoints
      totals.outcome += entry.resultPoints
      totals.knockout += entry.knockoutPoints
      totals.bracket += entry.bracketPoints
    }
    const count = leaderboard.length
    const averages =
      count > 0
        ? {
            total: Math.round(totals.total / count),
            exact: Math.round(totals.exact / count),
            outcome: Math.round(totals.outcome / count),
            knockout: Math.round(totals.knockout / count),
            bracket: Math.round(totals.bracket / count)
          }
        : {
            total: 0,
            exact: 0,
            outcome: 0,
            knockout: 0,
            bracket: 0
          }
    return { totals, averages }
  }, [leaderboard])

  const leaderEntry = leaderboard[0]
  const currentEntry = leaderboard.find((entry) => entry.member.id === userId)
  const currentRank = currentEntry
    ? leaderboard.findIndex((entry) => entry.member.id === userId) + 1
    : null
  const averagePoints = leaderboardSummary.averages.total

  const podiumEntries = leaderboard.slice(0, 3)
  const currentInPodium = currentRank !== null && currentRank <= podiumEntries.length
  const shouldReducePageSize = !!currentEntry && !currentInPodium
  const pageSize = shouldReducePageSize ? Math.max(1, basePageSize - 1) : basePageSize
  const listSource = leaderboard.length > 3 ? leaderboard.slice(3) : leaderboard
  const listOffset = leaderboard.length > 3 ? 3 : 0
  const currentListIndex = currentRank !== null ? currentRank - 1 - listOffset : null
  const currentPageForUser =
    currentListIndex !== null && currentListIndex >= 0
      ? Math.floor(currentListIndex / pageSize) + 1
      : null

  useEffect(() => {
    if (leaderboard.length === 0) return
    const listCount = leaderboard.length > 3 ? leaderboard.length - 3 : leaderboard.length
    const nextPageCount = Math.max(1, Math.ceil(listCount / pageSize))
    setPage((current) => Math.min(current, nextPageCount))
  }, [leaderboard, pageSize])

  const pageCount = Math.max(1, Math.ceil(listSource.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pageEntries = listSource.slice(pageStart, pageStart + pageSize)
  const currentOnPage = currentPageForUser === page
  function handleJumpToCurrent() {
    if (!currentPageForUser || currentInPodium) return
    setPage(currentPageForUser)
  }

  const pinCurrentUser = true
  const showPinnedRow =
    pinCurrentUser && currentEntry && !currentInPodium && !currentOnPage && listSource.length > 0

  const renderRow = (entry: typeof leaderboard[number], rank: number, pinned?: boolean) => {
    const isLeader = leaderEntry ? entry.member.id === leaderEntry.member.id : false
    const isCurrent = entry.member.id === userId
    const delta = leaderEntry ? Math.max(0, leaderEntry.totalPoints - entry.totalPoints) : 0
    const deltaLabel =
      pinned ? 'You' : isLeader ? 'Leader' : `+${delta}`
    const deltaTone = pinned ? 'you' : isLeader ? 'leader' : 'gap'
    const rowClassName = [
      'leaderboardRow',
      isCurrent ? 'leaderboardHighlight' : '',
      pinned ? 'leaderboardRowPinned' : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div key={`${entry.member.id}-${pinned ? 'pinned' : 'row'}`} className={rowClassName}>
        <div className="leaderboardRank">#{rank}</div>
        <div className="leaderboardName">
          <div className="leaderboardNameMain">
            <span className="leaderboardNameText">{entry.member.name}</span>
            {isCurrent ? <Badge tone="info">You</Badge> : null}
          </div>
          {entry.member.handle ? <span className="leaderboardHandle">@{entry.member.handle}</span> : null}
        </div>
        <div className="leaderboardTotal">{entry.totalPoints}</div>
        <div className="leaderboardBreakdown">
          <span className="leaderboardBreakdownItem leaderboardPoints" data-label="Exact">
            {entry.exactPoints}
          </span>
          <span className="leaderboardBreakdownItem" data-label="Outcome">
            {entry.resultPoints}
          </span>
          <span className="leaderboardBreakdownItem" data-label="KO">
            {entry.knockoutPoints}
          </span>
          <span className="leaderboardBreakdownItem" data-label="Bracket">
            {entry.bracketPoints}
          </span>
        </div>
        <div className="leaderboardDeltaTag" data-tone={deltaTone}>
          {deltaLabel}
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <PageHeader
        kicker="Standings"
        title="Leaderboard"
        subtitle="League standings and point breakdowns."
        actions={
          state.status === 'ready' ? (
            <div className="flex flex-col items-end gap-1 text-right text-xs text-muted-foreground">
              <div className="uppercase tracking-[0.2em]">Last updated</div>
              <div className="text-sm font-semibold text-foreground">
                {formatUpdatedAt(state.lastUpdated)}
              </div>
            </div>
          ) : null
        }
      />

      {state.status === 'loading' ? (
        <div className="stack">
          <Skeleton height={18} />
          <Skeleton height={18} width="70%" />
          <span className="sr-only">Loading...</span>
        </div>
      ) : null}
      {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}

      {state.status === 'ready' ? (
        leaderboard.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            No finished matches to score yet.
          </Card>
        ) : (
          <>
            <Card className="leaderboardOverview p-5">
              <div className="leaderboardOverviewHeader">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    League pulse
                  </div>
                  <div className="text-lg font-semibold text-foreground">Current snapshot</div>
                </div>
                <div className="leaderboardOverviewMeta">Finished matches only.</div>
              </div>
              <div className="leaderboardCategoryRow">
                <div className="leaderboardCategoryChip" data-tone="total">
                  <span className="leaderboardCategoryLabel">Avg total</span>
                  <span className="leaderboardCategoryValue">
                    {leaderboardSummary.averages.total}
                  </span>
                </div>
                <div className="leaderboardCategoryChip">
                  <span className="leaderboardCategoryLabel">Exact avg</span>
                  <span className="leaderboardCategoryValue">
                    {leaderboardSummary.averages.exact}
                  </span>
                </div>
                <div className="leaderboardCategoryChip">
                  <span className="leaderboardCategoryLabel">Outcome avg</span>
                  <span className="leaderboardCategoryValue">
                    {leaderboardSummary.averages.outcome}
                  </span>
                </div>
                <div className="leaderboardCategoryChip">
                  <span className="leaderboardCategoryLabel">KO avg</span>
                  <span className="leaderboardCategoryValue">
                    {leaderboardSummary.averages.knockout}
                  </span>
                </div>
                <div className="leaderboardCategoryChip">
                  <span className="leaderboardCategoryLabel">Bracket avg</span>
                  <span className="leaderboardCategoryValue">
                    {leaderboardSummary.averages.bracket}
                  </span>
                </div>
              </div>
              <div className="podiumPulse leaderboardOverviewGrid">
                <div className="podiumPulseStat">
                  <span className="podiumPulseValue">{leaderboard.length}</span>
                  <span className="podiumPulseLabel">Players</span>
                </div>
                <div className="podiumPulseStat">
                  <span className="podiumPulseValue">{averagePoints}</span>
                  <span className="podiumPulseLabel">Avg points</span>
                </div>
                <div className="podiumPulseStat">
                  <span className="podiumPulseValue">{leaderEntry?.totalPoints ?? 0}</span>
                  <span className="podiumPulseLabel">Leader total</span>
                </div>
                {currentRank ? (
                  <div className="podiumPulseStat">
                    <span className="podiumPulseValue">#{currentRank}</span>
                    <span className="podiumPulseLabel">Your rank</span>
                  </div>
                ) : null}
                {currentEntry ? (
                  <div className="podiumPulseStat">
                    <span className="podiumPulseValue">{currentEntry.totalPoints}</span>
                    <span className="podiumPulseLabel">Your total</span>
                  </div>
                ) : null}
              </div>
            </Card>
            {podiumEntries.length > 0 ? (
              <Card className="leaderboardPodium p-5">
                <div className="leaderboardPodiumHeader">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Podium
                    </div>
                    <div className="text-lg font-semibold text-foreground">Top 3</div>
                    <div className="podiumMeta">
                      Top {podiumEntries.length} of {leaderboard.length}
                    </div>
                  </div>
                </div>
                <div className="podiumGrid">
                  {podiumEntries.map((entry, index) => {
                    const rank = index + 1
                    return (
                      <div
                        key={entry.member.id}
                        className={
                          entry.member.id === userId
                            ? 'podiumCard podiumCardHighlight'
                            : 'podiumCard'
                        }
                        data-rank={rank}
                      >
                        <div className="podiumRank">#{rank}</div>
                        <div className="podiumName">
                          {entry.member.name}
                          {entry.member.handle ? (
                            <span className="podiumHandle">@{entry.member.handle}</span>
                          ) : null}
                        </div>
                        <div className="podiumPoints">{entry.totalPoints}</div>
                        <div className="podiumBreakdown">
                          <span>Exact {entry.exactPoints}</span>
                          <span>Outcome {entry.resultPoints}</span>
                          <span>KO {entry.knockoutPoints}</span>
                          <span>Bracket {entry.bracketPoints}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            ) : null}

            <Card className="leaderboardListCard leaderboardListFull p-5">
              <div className="leaderboardListControls">
                <div className="leaderboardListTitle">Full standings</div>
                {currentEntry && currentRank ? (
                  currentInPodium ? (
                    <div className="leaderboardUserHint">You are on the podium.</div>
                  ) : (
                    <div className="leaderboardUserActions">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleJumpToCurrent}
                        disabled={!currentPageForUser || currentOnPage}
                      >
                        Find me
                      </Button>
                    </div>
                  )
                ) : null}
              </div>
              <div className="leaderboardListHeader">
                <div>Rank</div>
                <div>Player</div>
                <div>Total</div>
                <div>Exact</div>
                <div>Outcome</div>
                <div>KO</div>
                <div>Bracket</div>
                <div>Behind</div>
              </div>
              {pageEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">No additional players yet.</div>
              ) : (
                <div className="leaderboardList">
                  {showPinnedRow && currentEntry && currentRank
                    ? renderRow(currentEntry, currentRank, true)
                    : null}
                  {pageEntries.map((entry, index) => {
                    const rank = listOffset + pageStart + index + 1
                    return renderRow(entry, rank)
                  })}
                </div>
              )}
              {listSource.length > pageSize ? (
                <div className="leaderboardPagination">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                  >
                    Prev
                  </Button>
                  <div className="paginationInfo">
                    Page {page} of {pageCount}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page === pageCount}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </Card>
          </>
        )
      ) : null}
    </div>
  )
}
