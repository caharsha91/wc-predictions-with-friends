import type { RivalDirectoryEntry } from './profilePersistence'

const RIVAL_LIMIT = 3

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function registerIdentityVariants(target: Set<string>, value: string | null | undefined) {
  const normalized = normalizeIdentity(value)
  if (!normalized) return
  target.add(normalized)
  target.add(`id:${normalized}`)
  target.add(`name:${normalized}`)
  target.add(`email:${normalized}`)
}

function sanitizeRivalUserIds(nextRivals: string[], viewerId: string): string[] {
  const viewerKey = normalizeIdentity(viewerId)
  const seen = new Set<string>()
  const result: string[] = []

  for (const rivalId of nextRivals) {
    const trimmed = rivalId.trim()
    const key = normalizeIdentity(trimmed)
    if (!trimmed || !key || key === viewerKey || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
    if (result.length >= RIVAL_LIMIT) break
  }

  return result
}

function buildDirectoryByIdentity(directory: RivalDirectoryEntry[]): Map<string, RivalDirectoryEntry> {
  const byIdentity = new Map<string, RivalDirectoryEntry>()
  for (const entry of directory) {
    const identityCandidates = [entry.id, entry.displayName, entry.email]
    for (const candidate of identityCandidates) {
      const normalized = normalizeIdentity(candidate)
      if (!normalized || byIdentity.has(normalized)) continue
      byIdentity.set(normalized, entry)
    }
  }
  return byIdentity
}

export function resolveCanonicalRivalIds(
  profileRivals: string[],
  viewerId: string,
  directory: RivalDirectoryEntry[]
): string[] {
  const sanitized = sanitizeRivalUserIds(profileRivals, viewerId)
  const byIdentity = buildDirectoryByIdentity(directory)
  const viewerKey = normalizeIdentity(viewerId)
  const seen = new Set<string>()
  const result: string[] = []

  for (const rivalId of sanitized) {
    const key = normalizeIdentity(rivalId)
    const canonical = byIdentity.get(key)?.id?.trim()
    const canonicalKey = normalizeIdentity(canonical)
    if (!canonical || !canonicalKey || canonicalKey === viewerKey || seen.has(canonicalKey)) continue
    seen.add(canonicalKey)
    result.push(canonical)
    if (result.length >= RIVAL_LIMIT) break
  }

  return result
}

export function buildRivalComparisonIdentities(
  rivalUserIds: string[],
  directory: RivalDirectoryEntry[]
): string[] {
  const byIdentity = buildDirectoryByIdentity(directory)
  const seen = new Set<string>()
  const identities: string[] = []

  for (const rivalId of rivalUserIds) {
    const rivalKey = normalizeIdentity(rivalId)
    const entry = byIdentity.get(rivalKey)
    const candidates = [rivalId, entry?.id, entry?.displayName, entry?.email]
    for (const candidate of candidates) {
      const normalized = normalizeIdentity(candidate)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      identities.push(candidate ?? normalized)
    }
  }

  return identities
}

export function buildRivalSlotLookup(
  rivalUserIds: string[],
  directory: RivalDirectoryEntry[]
): Map<string, number> {
  const byIdentity = buildDirectoryByIdentity(directory)
  const slotByIdentity = new Map<string, number>()

  for (let index = 0; index < rivalUserIds.length; index += 1) {
    const slot = index + 1
    const rivalId = rivalUserIds[index]
    const rivalKey = normalizeIdentity(rivalId)
    const entry = byIdentity.get(rivalKey)
    const keys = new Set<string>()
    registerIdentityVariants(keys, rivalId)
    registerIdentityVariants(keys, entry?.id)
    registerIdentityVariants(keys, entry?.displayName)
    registerIdentityVariants(keys, entry?.email)

    for (const key of keys) {
      if (!slotByIdentity.has(key)) slotByIdentity.set(key, slot)
    }
  }

  return slotByIdentity
}
