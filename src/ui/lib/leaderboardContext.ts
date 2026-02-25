import type { LeaderboardEntry } from '../../types/leaderboard'

export type RankedLeaderboardEntry = {
  entry: LeaderboardEntry
  rank: number
}

export type LeaderboardUserContext = {
  current: RankedLeaderboardEntry
  above: RankedLeaderboardEntry | null
  below: RankedLeaderboardEntry | null
}

function normalizeIdentity(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

export function resolveLeaderboardIdentityKeys(entry: LeaderboardEntry): string[] {
  const keys = new Set<string>()
  const memberId = normalizeIdentity(entry.member.id)
  const memberEmail = normalizeIdentity(entry.member.email)
  const memberName = normalizeIdentity(entry.member.name)

  if (memberId) {
    keys.add(memberId)
    keys.add(`id:${memberId}`)
  }

  if (memberEmail) {
    keys.add(memberEmail)
    keys.add(`email:${memberEmail}`)
  }

  if (memberName) {
    keys.add(`name:${memberName}`)
    if (!memberId && !memberEmail) {
      keys.add(memberName)
    }
  }

  return [...keys]
}

export function buildViewerKeySet(values: Array<string | null | undefined>): Set<string> {
  const keys = new Set<string>()
  for (const value of values) {
    const normalized = normalizeIdentity(value)
    if (!normalized) continue
    keys.add(normalized)
    keys.add(`id:${normalized}`)
    keys.add(`email:${normalized}`)
    keys.add(`name:${normalized}`)
  }
  return keys
}

export function resolveLeaderboardUserContext(
  entries: LeaderboardEntry[],
  viewerKeys: Set<string>
): LeaderboardUserContext | null {
  const currentIndex = entries.findIndex((entry) =>
    resolveLeaderboardIdentityKeys(entry).some((key) => viewerKeys.has(key))
  )
  if (currentIndex < 0) return null

  return {
    current: { entry: entries[currentIndex], rank: currentIndex + 1 },
    above: currentIndex > 0 ? { entry: entries[currentIndex - 1], rank: currentIndex } : null,
    below:
      currentIndex < entries.length - 1
        ? { entry: entries[currentIndex + 1], rank: currentIndex + 2 }
        : null
  }
}
