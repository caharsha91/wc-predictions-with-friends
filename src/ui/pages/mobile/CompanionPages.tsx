import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ButtonLink } from '../../components/ui/Button'
import PageHeaderV2 from '../../components/v2/PageHeaderV2'
import PageShellV2 from '../../components/v2/PageShellV2'
import SectionCardV2 from '../../components/v2/SectionCardV2'

function CompanionPageFrame({
  kicker,
  title,
  subtitle,
  webHandoffPath,
  webHandoffLabel,
  children
}: {
  kicker: string
  title: string
  subtitle: string
  webHandoffPath: string
  webHandoffLabel: string
  children: ReactNode
}) {
  return (
    <PageShellV2 className="space-y-3">
      <PageHeaderV2
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        actions={(
          <ButtonLink to={webHandoffPath} size="sm" variant="secondary">
            {webHandoffLabel}
          </ButtonLink>
        )}
      />
      {children}
    </PageShellV2>
  )
}

export function CompanionHomePage() {
  return (
    <CompanionPageFrame
      kicker="Companion"
      title="Mobile Companion"
      subtitle="Phase 0 guardrails are live. Companion routes are now owned under /m/*."
      webHandoffPath="/"
      webHandoffLabel="Open web play center"
    >
      <SectionCardV2 tone="panel" density="none" className="space-y-2 p-4">
        <div className="v2-type-body-sm text-muted-foreground">
          Companion scope focuses on quick check-ins and time-sensitive actions. Dense setup and admin stay on web.
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/m/predictions" size="sm" variant="primary">Predictions</ButtonLink>
          <ButtonLink to="/m/leaderboard" size="sm" variant="secondary">Leaderboard</ButtonLink>
          <ButtonLink to="/m/matches" size="sm" variant="secondary">Match Center</ButtonLink>
          <ButtonLink to="/m/profile" size="sm" variant="secondary">Profile</ButtonLink>
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionPredictionsPage() {
  return (
    <CompanionPageFrame
      kicker="Companion"
      title="Predictions Companion"
      subtitle="Quick edits are in-scope here. Dense setup and deep analysis remain web-first."
      webHandoffPath="/match-picks"
      webHandoffLabel="Continue on web"
    >
      <SectionCardV2 tone="panel" density="none" className="space-y-2 p-4">
        <div className="v2-type-body-sm text-muted-foreground">
          Out-of-scope workflows should use explicit web handoff instead of partial mobile replicas.
        </div>
        <div className="grid gap-2 text-sm">
          <Link to="/match-picks" className="rounded-lg border border-border px-3 py-2 text-foreground">Match picks (web)</Link>
          <Link to="/knockout-bracket" className="rounded-lg border border-border px-3 py-2 text-foreground">Knockout bracket (web)</Link>
          <Link to="/group-stage/A" className="rounded-lg border border-border px-3 py-2 text-foreground">Group stage review (web)</Link>
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionLeaderboardPage() {
  return (
    <CompanionPageFrame
      kicker="Companion"
      title="Leaderboard & Rivalry"
      subtitle="Rival-focused mobile flow lands in later phases; dense leaderboard tables stay web-first."
      webHandoffPath="/leaderboard"
      webHandoffLabel="Continue on web"
    >
      <SectionCardV2 tone="panel" density="none" className="p-4">
        <div className="v2-type-body-sm text-muted-foreground">
          Companion safeguards are active for this route namespace.
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionMatchesPage() {
  return (
    <CompanionPageFrame
      kicker="Companion"
      title="Match Center"
      subtitle="Live/upcoming/results context will be added incrementally from the shared timeline model."
      webHandoffPath="/match-picks"
      webHandoffLabel="Continue on web"
    >
      <SectionCardV2 tone="panel" density="none" className="p-4">
        <div className="v2-type-body-sm text-muted-foreground">
          Use web for full fixtures and archive detail until match-center flows are fully migrated.
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}

export function CompanionProfilePage() {
  return (
    <CompanionPageFrame
      kicker="Companion"
      title="Profile & League Context"
      subtitle="Companion routes intentionally exclude admin and demo controls."
      webHandoffPath="/"
      webHandoffLabel="Open web"
    >
      <SectionCardV2 tone="panel" density="none" className="space-y-2 p-4">
        <div className="v2-type-body-sm text-muted-foreground">
          Route guardrails redirect `/m/admin*` and `/m/demo*` away from the companion surface.
        </div>
      </SectionCardV2>
    </CompanionPageFrame>
  )
}
