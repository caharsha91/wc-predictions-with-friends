import type { HTMLAttributes, ReactNode } from 'react'

import type { SemanticState } from '../../lib/semanticState'
import { semanticSurfaceClass } from '../../lib/semanticState'
import { cn } from '../../lib/utils'

export type V2CardTone = 'default' | 'hero' | 'tile' | 'panel' | 'subtle' | 'side' | 'inset' | 'row'

type V2CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  as?: 'section' | 'article' | 'div'
  withGlow?: boolean
  tone?: V2CardTone
  state?: SemanticState
}

export default function V2Card({
  children,
  className,
  as: Tag = 'section',
  withGlow = true,
  tone = 'default',
  state = 'default',
  style,
  ...props
}: V2CardProps) {
  const toneClass =
    tone === 'hero'
      ? 'v2-card-tone-hero'
      : tone === 'tile'
        ? 'v2-card-tone-tile'
        : tone === 'panel'
          ? 'v2-card-tone-panel'
          : tone === 'subtle'
            ? 'v2-card-tone-subtle'
            : tone === 'side'
              ? 'v2-card-tone-side'
              : tone === 'inset'
                ? 'v2-card-tone-inset'
                : tone === 'row'
                  ? 'v2-card-tone-row'
                  : 'v2-card-tone-default'

  return (
    <Tag
      {...props}
      className={cn(
        'v2-card-base rounded-2xl border text-card-foreground',
        toneClass,
        withGlow ? 'v2-card-glow' : 'v2-card-no-glow',
        semanticSurfaceClass(state),
        className
      )}
      style={{
        transition:
          'box-shadow var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard), background var(--motion-duration-fast) var(--motion-ease-standard)',
        ...style
      }}
      data-semantic-state={state}
    >
      {children}
    </Tag>
  )
}
