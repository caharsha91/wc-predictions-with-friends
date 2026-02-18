function formatUtcDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso))
}

function formatLocalDateTimeWithZone(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(iso))
}

export function formatUtcAndLocalDeadline(iso?: string): string {
  if (!iso) return '—'
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return '—'
  return `${formatUtcDateTime(iso)} UTC • ${formatLocalDateTimeWithZone(iso)} local`
}
