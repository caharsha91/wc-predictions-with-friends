import type { ComponentProps } from 'react'

import { cn } from '../../lib/utils'
import V2Card from './V2Card'

type SectionCardV2Props = ComponentProps<typeof V2Card> & {
  density?: 'comfortable' | 'compact' | 'none'
  role?: 'primary' | 'side' | 'inset'
  depth?: 'primary' | 'embedded'
}

export default function SectionCardV2({
  className,
  density = 'comfortable',
  role = 'primary',
  depth = 'primary',
  tone,
  withGlow,
  children,
  ...props
}: SectionCardV2Props) {
  const roleTone = role === 'side' ? 'side' : role === 'inset' ? 'inset' : 'panel'
  const resolvedTone = tone ?? roleTone
  const resolvedWithGlow = withGlow ?? (depth === 'primary' && role !== 'inset')
  const densityClass =
    density === 'none'
      ? 'p-0'
      : density === 'compact'
        ? 'px-3 py-3.5 md:px-4 md:py-4'
        : 'px-4 py-5 md:px-5 md:py-6'
  const depthClass = depth === 'embedded' ? 'v2-section-depth-embedded' : 'v2-section-depth-primary'

  return (
    <V2Card
      {...props}
      tone={resolvedTone}
      withGlow={resolvedWithGlow}
      className={cn('v2-section-card rounded-2xl', depthClass, densityClass, className)}
      data-surface-depth={depth}
    >
      {children}
    </V2Card>
  )
}
