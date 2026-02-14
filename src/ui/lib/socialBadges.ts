import { getPredictedWinner } from '../../lib/picks'
import type { Match } from '../../types/matches'
import type { Pick } from '../../types/picks'

type UserPickDoc = {
  userId: string
  picks: Pick[]
  updatedAt: string
}

export type SocialBadgeKind = 'perfect_pick' | 'contrarian' | 'underdog'

export type SocialBadge = {
  kind: SocialBadgeKind
  label: string
  description: string
}

const CONTRARIAN_THRESHOLD = 20
const UNDERDOG_THRESHOLD = 35

const SOCIAL_BADGE_DETAILS: Record<SocialBadgeKind, Omit<SocialBadge, 'kind'>> = {
  perfect_pick: {
    label: 'Perfect Pick',
    description: 'Exact score hit.'
  },
  contrarian: {
    label: 'Contrarian',
    description: 'Picked a side with under 20% support.'
  },
  underdog: {
    label: 'Underdog',
    description: 'Picked a low-consensus winner.'
  }
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

function scoreSharePct(
  matchId: string,
  winner: 'HOME' | 'AWAY',
  consensus: Map<string, { total: number; home: number; away: number }>
): number | null {
  const counts = consensus.get(matchId)
  if (!counts || counts.total <= 0) return null
  const winnerVotes = winner === 'HOME' ? counts.home : counts.away
  return (winnerVotes / counts.total) * 100
}

export function buildSocialBadgeMap(
  matches: Match[],
  picksDocs: UserPickDoc[]
): Map<string, SocialBadge[]> {
  const matchById = new Map(matches.map((match) => [match.id, match]))
  const consensus = new Map<string, { total: number; home: number; away: number }>()

  for (const doc of picksDocs) {
    for (const pick of doc.picks) {
      const winner = getPredictedWinner(pick)
      if (winner !== 'HOME' && winner !== 'AWAY') continue
      const current = consensus.get(pick.matchId) ?? { total: 0, home: 0, away: 0 }
      current.total += 1
      if (winner === 'HOME') current.home += 1
      if (winner === 'AWAY') current.away += 1
      consensus.set(pick.matchId, current)
    }
  }

  const badgeKindsByUser = new Map<string, Set<SocialBadgeKind>>()

  for (const doc of picksDocs) {
    const key = normalizeKey(doc.userId)
    const userKinds = badgeKindsByUser.get(key) ?? new Set<SocialBadgeKind>()

    for (const pick of doc.picks) {
      const match = matchById.get(pick.matchId)
      if (!match) continue

      if (
        match.status === 'FINISHED' &&
        match.score &&
        typeof pick.homeScore === 'number' &&
        typeof pick.awayScore === 'number' &&
        pick.homeScore === match.score.home &&
        pick.awayScore === match.score.away
      ) {
        userKinds.add('perfect_pick')
      }

      const winner = getPredictedWinner(pick)
      if (winner !== 'HOME' && winner !== 'AWAY') continue
      const sharePct = scoreSharePct(pick.matchId, winner, consensus)
      if (sharePct === null) continue
      if (sharePct < CONTRARIAN_THRESHOLD) userKinds.add('contrarian')
      if (sharePct <= UNDERDOG_THRESHOLD) userKinds.add('underdog')
    }

    badgeKindsByUser.set(key, userKinds)
  }

  const badgesByUser = new Map<string, SocialBadge[]>()
  for (const [userId, kinds] of badgeKindsByUser.entries()) {
    const orderedKinds: SocialBadgeKind[] = ['perfect_pick', 'contrarian', 'underdog']
    const badges = orderedKinds
      .filter((kind) => kinds.has(kind))
      .map((kind) => ({
        kind,
        ...SOCIAL_BADGE_DETAILS[kind]
      }))
    badgesByUser.set(userId, badges)
  }

  return badgesByUser
}
