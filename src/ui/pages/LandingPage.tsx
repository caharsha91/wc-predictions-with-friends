import PageHeader from '../components/ui/PageHeader'
import { ButtonLink } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export default function LandingPage() {
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
          <div className="sectionTitle">Build picks in three steps</div>
          <ul className="landingList">
            <li>Select the matchday and enter a score prediction for each match.</li>
            <li>Choose a match result to go with your score (home win, draw, away win).</li>
            <li>For knockout games, pick the eventual winner for AET/Pens.</li>
          </ul>
          <div className="landingNote">
            Picks are independent. You can hedge with a result that conflicts with your score
            prediction and an eventual winner that conflicts with your initial pick.
          </div>
        </Card>
        <Card>
          <div className="sectionKicker">Scoring</div>
          <div className="sectionTitle">Points stack across categories</div>
          <ul className="landingList">
            <li>Exact scores earn the most points.</li>
            <li>Match results score points even if the exact score is off.</li>
            <li>Knockout eventual winner picks score separately from the result.</li>
            <li>Bracket picks score for group qualifiers and knockout winners.</li>
          </ul>
          <div className="landingNote">
            Score picks are for 90 minutes only. Extra time and penalties only count for the
            eventual winner.
          </div>
        </Card>
      </div>
    </div>
  )
}
