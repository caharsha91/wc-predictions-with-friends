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

export function resolveLeaderboardIdentityKeys(entry: LeaderboardEntry): string[] {
  const keys: string[] = []
  if (entry.member.id) keys.push(entry.member.id.toLowerCase())
  if (entry.member.uid) keys.push(entry.member.uid.toLowerCase())
  if (entry.member.email) keys.push(entry.member.email.toLowerCase())
  return keys
}

export function buildViewerKeySet(values: Array<string | null | undefined>): Set<string> {
  const keys = new Set<string>()
  for (const value of values) {
    const normalized = value?.trim().toLowerCase()
    if (normalized) keys.add(normalized)
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
