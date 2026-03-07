import type { ComponentProps } from 'react'

import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'

type StatusTagV2Props = Omit<ComponentProps<typeof Badge>, 'size' | 'case'>

export default function StatusTagV2({ className, ...props }: StatusTagV2Props) {
  return <Badge {...props} size="xs" case="normal" className={cn('v2-status-tag v2-type-chip', className)} />
}
