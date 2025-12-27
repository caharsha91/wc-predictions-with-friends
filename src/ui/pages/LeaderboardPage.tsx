import { useEffect, useMemo, useState } from 'react'

import { fetchLeaderboard } from '../../lib/data'
import type { LeaderboardEntry } from '../../types/leaderboard'
import { useViewerId } from '../hooks/useViewerId'

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

  const leaderEntry = leaderboard[0]
  const currentEntry = leaderboard.find((entry) => entry.member.id === userId)
  const currentRank = currentEntry
    ? leaderboard.findIndex((entry) => entry.member.id === userId) + 1
    : null
  const totalPoints = leaderboard.reduce((sum, entry) => sum + entry.totalPoints, 0)
  const averagePoints = leaderboard.length > 0 ? Math.round(totalPoints / leaderboard.length) : 0

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
    const delta = leaderEntry ? Math.max(0, leaderEntry.totalPoints - entry.totalPoints) : 0
    const deltaLabel =
      pinned ? 'Pinned' : leaderEntry && entry.member.id === leaderEntry.member.id ? 'Leader' : `+${delta}`
    const rowClassName = [
      'leaderboardRow',
      entry.member.id === userId ? 'leaderboardHighlight' : '',
      pinned ? 'leaderboardRowPinned' : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div key={`${entry.member.id}-${pinned ? 'pinned' : 'row'}`} className={rowClassName}>
        <div className="leaderboardRank">#{rank}</div>
        <div className="leaderboardName">
          {entry.member.name}
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
        <div className="leaderboardDeltaTag">{deltaLabel}</div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="leaderboardHeader">
        <div>
          <div className="sectionKicker">Standings</div>
          <h1 className="h1">Leaderboard</h1>
          <div className="pageSubtitle">League standings and point breakdowns.</div>
        </div>
        <div className="leaderboardHeaderActions">
          {state.status === 'ready' ? (
            <div className="lastUpdated">
              <div className="lastUpdatedLabel">Last updated</div>
              <div className="lastUpdatedValue">{formatUpdatedAt(state.lastUpdated)}</div>
            </div>
          ) : null}
        </div>
      </div>

      {state.status === 'loading' ? <div className="muted">Loading...</div> : null}
      {state.status === 'error' ? <div className="error">{state.message}</div> : null}

      {state.status === 'ready' ? (
        leaderboard.length === 0 ? (
          <div className="card muted">No finished matches to score yet.</div>
        ) : (
          <>
            <div className="card leaderboardOverview">
              <div className="leaderboardOverviewHeader">
                <div>
                  <div className="sectionKicker">League pulse</div>
                  <div className="sectionTitle">Current snapshot</div>
                </div>
                <div className="leaderboardOverviewMeta">Finished matches only.</div>
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
            </div>
            {podiumEntries.length > 0 ? (
              <div className="card leaderboardPodium">
                <div className="leaderboardPodiumHeader">
                  <div>
                    <div className="sectionKicker">Podium</div>
                    <div className="sectionTitle">Top 3</div>
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
              </div>
            ) : null}

            <div className="card leaderboardListCard leaderboardListFull">
              <div className="leaderboardListControls">
                <div className="leaderboardListTitle">Full standings</div>
                {currentEntry && currentRank ? (
                  currentInPodium ? (
                    <div className="leaderboardUserHint">You are on the podium.</div>
                  ) : (
                    <div className="leaderboardUserActions">
                      <button
                        type="button"
                        className="button buttonSmall buttonSecondary"
                        onClick={handleJumpToCurrent}
                        disabled={!currentPageForUser || currentOnPage}
                      >
                        Jump to my rank
                      </button>
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
                <div className="muted">No additional players yet.</div>
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
                  <button
                    type="button"
                    className="paginationButton"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                  >
                    Prev
                  </button>
                  <div className="paginationInfo">
                    Page {page} of {pageCount}
                  </div>
                  <button
                    type="button"
                    className="paginationButton"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page === pageCount}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )
      ) : null}
    </div>
  )
}
