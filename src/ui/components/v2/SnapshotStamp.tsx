import { cn } from '../../lib/utils'
import { SNAPSHOT_UNAVAILABLE_LABEL, formatSnapshotTimestamp } from '../../lib/snapshotStamp'

type SnapshotStampProps = {
  timestamp?: string | null
  label?: string
  prefix?: string
  className?: string
}

export default function SnapshotStamp({ timestamp, label = 'Updated', prefix, className }: SnapshotStampProps) {
  const timestampLabel = formatSnapshotTimestamp(timestamp)
  const hasSnapshot = timestampLabel !== SNAPSHOT_UNAVAILABLE_LABEL
  const text = !hasSnapshot
    ? timestampLabel
    : typeof prefix === 'string'
      ? `${prefix}${timestampLabel}`
      : label
        ? `${label} ${timestampLabel}`
        : timestampLabel

  return (
    <span className={cn('v2-type-meta', className)} data-v2-last-updated="true">
      {text}
    </span>
  )
}
