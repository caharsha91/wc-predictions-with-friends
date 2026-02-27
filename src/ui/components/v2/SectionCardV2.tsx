import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils'
import V2Card from './V2Card'

type SectionCardV2Props = ComponentProps<typeof V2Card> & {
  density?: 'comfortable' | 'compact' | 'none'
  role?: 'primary' | 'side' | 'inset'
}

export default function SectionCardV2({
  className,
  density = 'comfortable',
  role = 'primary',
  tone,
  children,
  ...props
}: SectionCardV2Props) {
  const roleTone = role === 'side' ? 'side' : role === 'inset' ? 'inset' : 'panel'
  const resolvedTone = tone ?? roleTone
  const densityClass =
    density === 'none'
      ? 'p-0'
      : density === 'compact'
        ? 'px-3 py-3.5 md:px-4 md:py-4'
        : 'px-4 py-5 md:px-5 md:py-6'

  return (
    <V2Card {...props} tone={resolvedTone} className={cn('v2-section-card rounded-2xl', densityClass, className)}>
      {children}
    </V2Card>
  )
}
