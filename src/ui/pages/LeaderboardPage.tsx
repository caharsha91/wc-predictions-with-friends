import { useEffect, useMemo, useState } from 'react'

import { CURRENT_USER_ID } from '../../lib/constants'
import {
  fetchBestThirdQualifiers,
  fetchBracketPredictions,
  fetchMatches,
  fetchMembers,
  fetchPicks,
  fetchScoring
} from '../../lib/data'
import { loadLocalBracketPrediction, mergeBracketPredictions } from '../../lib/bracket'
import { loadLocalPicks, mergePicks } from '../../lib/picks'
import { buildLeaderboard } from '../../lib/scoring'
import type { BracketPrediction } from '../../types/bracket'
import type { Member } from '../../types/members'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'
import type { ScoringConfig } from '../../types/scoring'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      matches: Match[]
      members: Member[]
      picks: Pick[]
      bracketPredictions: BracketPrediction[]
      scoring: ScoringConfig
      bestThirdQualifiers: string[]
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
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    let canceled = false
    async function load() {
      setState({ status: 'loading' })
      try {
        const [
          matchesFile,
          membersFile,
          picksFile,
          scoringFile,
          bracketFile,
          bestThirdFile
        ] = await Promise.all([
          fetchMatches(),
          fetchMembers(),
          fetchPicks(),
          fetchScoring(),
          fetchBracketPredictions(),
          fetchBestThirdQualifiers()
        ])
        if (canceled) return

        const localPicks = loadLocalPicks(CURRENT_USER_ID)
        const merged = mergePicks(picksFile.picks, localPicks, CURRENT_USER_ID)
        const localBracket = loadLocalBracketPrediction(CURRENT_USER_ID)
        const mergedBrackets = mergeBracketPredictions(
          bracketFile.predictions,
          localBracket,
          CURRENT_USER_ID
        )
        setState({
          status: 'ready',
          matches: matchesFile.matches,
          members: membersFile.members,
          picks: merged,
          bracketPredictions: mergedBrackets,
          scoring: scoringFile,
          bestThirdQualifiers: bestThirdFile.qualifiers,
          lastUpdated: matchesFile.lastUpdated
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

  const leaderboard = useMemo(() => {
    if (state.status !== 'ready') return []
    return buildLeaderboard(
      state.members,
      state.matches,
      state.picks,
      state.bracketPredictions,
      state.scoring,
      state.bestThirdQualifiers
    )
  }, [state])

  useEffect(() => {
    if (leaderboard.length === 0) return
    const pageCount = Math.max(1, Math.ceil(leaderboard.length / pageSize))
    setPage((current) => Math.min(current, pageCount))
  }, [leaderboard, pageSize])

  const pageCount = Math.max(1, Math.ceil(leaderboard.length / pageSize))
  const pageStart = (page - 1) * pageSize
  const pageEntries = leaderboard.slice(pageStart, pageStart + pageSize)

  return (
    <div className="stack">
      <div className="row rowSpaceBetween">
        <div>
          <div className="sectionKicker">Standings</div>
          <h1 className="h1">Leaderboard</h1>
        </div>
        {state.status === 'ready' ? (
          <div className="lastUpdated">
            <div className="lastUpdatedLabel">Last updated</div>
            <div className="lastUpdatedValue">{formatUpdatedAt(state.lastUpdated)}</div>
          </div>
        ) : null}
      </div>

      {state.status === 'loading' ? <div className="muted">Loading...</div> : null}
      {state.status === 'error' ? <div className="error">{state.message}</div> : null}

      {state.status === 'ready' ? (
        <div className="card">
          {leaderboard.length === 0 ? (
            <div className="muted">No finished matches to score yet.</div>
          ) : (
            <div className="leaderboardTable">
              <div className="leaderboardRow leaderboardHeader">
                <div>#</div>
                <div>Player</div>
                <div>Exact</div>
                <div>Outcome</div>
                <div>Knockout</div>
                <div>Bracket</div>
                <div>Total</div>
              </div>
              {pageEntries.map((entry, index) => (
                <div
                  key={entry.member.id}
                  className={
                    entry.member.id === CURRENT_USER_ID
                      ? 'leaderboardRow leaderboardHighlight'
                      : 'leaderboardRow'
                  }
                >
                  <div className="leaderboardRank">{pageStart + index + 1}</div>
                  <div className="leaderboardName">
                    {entry.member.name}
                    {entry.member.handle ? (
                      <span className="leaderboardHandle">@{entry.member.handle}</span>
                    ) : null}
                  </div>
                  <div className="leaderboardPoints">{entry.exactPoints}</div>
                  <div>{entry.resultPoints}</div>
                  <div>{entry.knockoutPoints}</div>
                  <div>{entry.bracketPoints}</div>
                  <div className="leaderboardTotal">{entry.totalPoints}</div>
                </div>
              ))}
            </div>
          )}
          {leaderboard.length > pageSize ? (
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
      ) : null}
    </div>
  )
}
