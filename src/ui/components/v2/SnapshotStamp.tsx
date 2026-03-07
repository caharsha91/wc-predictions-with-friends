import { cn } from '../../lib/utils'
import { SNAPSHOT_UNAVAILABLE_LABEL, formatSnapshotTimestamp } from '../../lib/snapshotStamp'

type SnapshotStampProps = {
  timestamp?: string | null
  prefix?: string
  className?: string
}

export default function SnapshotStamp({ timestamp, prefix, className }: SnapshotStampProps) {
  const label = formatSnapshotTimestamp(timestamp)
  const text = prefix && label !== SNAPSHOT_UNAVAILABLE_LABEL ? `${prefix}${label}` : label

  return (
    <span className={cn('text-[13px] leading-[1.35] text-muted-foreground', className)} data-v2-last-updated="true">
      {text}
    </span>
  )
}
