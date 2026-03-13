export const SNAPSHOT_UNAVAILABLE_LABEL = 'Snapshot unavailable'

export function formatSnapshotTimestamp(iso?: string | null): string {
  if (!iso) return SNAPSHOT_UNAVAILABLE_LABEL
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return SNAPSHOT_UNAVAILABLE_LABEL

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

export function formatUpdatedTimestamp(iso?: string | null): string {
  const label = formatSnapshotTimestamp(iso)
  if (label === SNAPSHOT_UNAVAILABLE_LABEL) return label
  return `Updated ${label}`
}
