import { useEffect, useMemo, useState } from 'react'

import PageHeader from '../components/ui/PageHeader'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import Table from '../components/ui/Table'
import { fetchScoring } from '../../lib/data'
import type { ScoringConfig } from '../../types/scoring'

type ScoreRange = { min: number; max: number }

function getRange(values: number[]): ScoreRange | null {
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

function formatRange(range: ScoreRange | null): string | null {
  if (!range) return null
  return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`
}

export default function LandingPage() {
  const [scoring, setScoring] = useState<ScoringConfig | null>(null)

  useEffect(() => {
    let canceled = false
    fetchScoring()
      .then((data) => {
        if (!canceled) setScoring(data)
      })
      .catch(() => {
        if (!canceled) setScoring(null)
      })
    return () => {
      canceled = true
    }
  }, [])

  const scoringSummary = useMemo(() => {
    if (!scoring) return null
    const knockoutStages = Object.values(scoring.knockout)
    const knockoutExact = formatRange(getRange(knockoutStages.map((stage) => stage.exactScoreBoth)))
    const knockoutOne = formatRange(getRange(knockoutStages.map((stage) => stage.exactScoreOne)))
    const knockoutResult = formatRange(getRange(knockoutStages.map((stage) => stage.result)))
    const knockoutWinner = formatRange(
      getRange(
        knockoutStages
          .map((stage) => stage.knockoutWinner)
          .filter((value): value is number => typeof value === 'number')
      )
    )
    const bracketKnockout = formatRange(getRange(Object.values(scoring.bracket.knockout)))
    return {
      group: scoring.group,
      knockout: {
        exact: knockoutExact,
        one: knockoutOne,
        result: knockoutResult,
        winner: knockoutWinner
      },
      bracket: {
        groupQualifiers: scoring.bracket.groupQualifiers,
        thirdPlaceQualifiers: scoring.bracket.thirdPlaceQualifiers,
        knockout: bracketKnockout
      }
    }
  }, [scoring])

  const scoringExamples = useMemo(() => {
    if (!scoring) return null
    const group = scoring.group
    return {
      outcomeOnly: group.result,
      exactScore: group.exactScoreBoth + group.result,
      bracketChampion: scoring.bracket.knockout.Final
    }
  }, [scoring])

  return (
    <div className="stack">
      <PageHeader
        kicker="Welcome"
        title="WC Predictions"
        subtitle="Make picks, track points, and follow every matchday with your league."
      />
      <Card className="landingHero">
        <div className="sectionKicker">Start here</div>
        <div className="sectionTitle">Your matchday command center</div>
        <div className="pageSubtitle">
          Lock in exact scores, pick results, and call knockout winners before kickoff.
        </div>
        <ul className="landingList">
          <li>Use Upcoming to enter picks by matchday before matches lock (30 minutes before kickoff).</li>
          <li>Check Results to see how your picks scored after final whistle.</li>
          <li>Complete bracket picks for group qualifiers and knockout winners.</li>
        </ul>
        <div className="landingCtas">
          <ButtonLink to="/upcoming">Start picking</ButtonLink>
          <ButtonLink to="/leaderboard" variant="secondary">
            View leaderboard
          </ButtonLink>
        </div>
      </Card>
      <div className="landingGrid">
        <Card>
          <div className="sectionKicker">How to play</div>
          <div className="sectionTitle">Get set up in minutes</div>
          <ul className="landingList">
            <li>Sign in with Google.</li>
            <li>Get allowlisted for the private league.</li>
            <li>Make match picks on /upcoming.</li>
            <li>Make bracket picks on /bracket (unlocks after groups).</li>
            <li>Review on /results and /leaderboard.</li>
          </ul>
        </Card>
        <Card>
          <div className="sectionKicker">Pick locks (PST)</div>
          <div className="sectionTitle">Deadlines to keep in mind</div>
          <div className="landingNote">
            <ul className="landingList">
              <li>Match picks lock 30 minutes before kickoff.</li>
              <li>
                Bracket group qualifiers + best third-place lock 11:59 PM PST day before first
                group match day.
              </li>
              <li>
                Bracket knockout picks lock 11:59 PM PST day before first knockout match day.
              </li>
              <li>Winner picks are independent of the score/result pick.</li>
            </ul>
          </div>
        </Card>
        <Card>
          <div className="sectionKicker">Scoring</div>
          <div className="sectionTitle">Points by category</div>
          <ul className="landingList">
            <li>
              <strong>Match picks:</strong>{' '}
              {scoringSummary ? (
                <>
                  Group stage exact ({scoringSummary.group.exactScoreBoth}), one team exact (
                  {scoringSummary.group.exactScoreOne}), result ({scoringSummary.group.result}).
                  Knockout rounds scale by stage: exact ({scoringSummary.knockout.exact}), one team
                  exact ({scoringSummary.knockout.one}), result ({scoringSummary.knockout.result}),
                  winner ({scoringSummary.knockout.winner}).
                </>
              ) : (
                <>
                  Exact scores earn the most points. Results score even if the exact score is off.
                  Knockout eventual winner scores separately.
                </>
              )}
            </li>
            <li>
              <strong>Bracket picks:</strong>{' '}
              {scoringSummary ? (
                <>
                  Group qualifiers ({scoringSummary.bracket.groupQualifiers} each), best third-place
                  ({scoringSummary.bracket.thirdPlaceQualifiers} each), knockout rounds (
                  {scoringSummary.bracket.knockout}).
                </>
              ) : (
                <>Group qualifiers and knockout winners score by stage.</>
              )}
            </li>
          </ul>
          <div className="landingNote">
            Score picks are for 90 minutes only. Extra time and penalties only count for the
            eventual winner.
          </div>
        </Card>
      </div>
      <Card>
        <div className="sectionKicker">Examples</div>
        <div className="sectionTitle">How points add up</div>
        <div className="tableWrapper">
          <Table>
            <thead>
              <tr>
                <th>Prediction</th>
                <th>Actual</th>
                <th>Points earned</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Group: USA 2-1 Mexico (USA win)</td>
                <td>USA 1-0 Mexico</td>
                <td>
                  {scoringExamples
                    ? `${scoringExamples.outcomeOnly} pts (result only)`
                    : 'Result points'}
                </td>
              </tr>
              <tr>
                <td>Group: Spain 2-1 Italy</td>
                <td>Spain 2-1 Italy</td>
                <td>
                  {scoringExamples
                    ? `${scoringExamples.exactScore} pts (exact + result)`
                    : 'Exact + result points'}
                </td>
              </tr>
              <tr>
                <td>Group: France 0-2 Brazil (Brazil win)</td>
                <td>France 2-0 Brazil</td>
                <td>0 pts</td>
              </tr>
              <tr>
                <td>Bracket: Champion Argentina</td>
                <td>Champion Argentina</td>
                <td>
                  {scoringExamples
                    ? `${scoringExamples.bracketChampion} pts (Final)`
                    : 'Bracket stage points'}
                </td>
              </tr>
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
