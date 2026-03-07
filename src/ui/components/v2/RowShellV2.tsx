import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import type { SemanticState } from '../../lib/semanticState'
import { semanticSurfaceClass } from '../../lib/semanticState'
import { cn } from '../../lib/utils'

type RowShellTone = 'default' | 'muted' | 'inset'
type RowShellState = SemanticState
type RowShellDepth = 'primary' | 'embedded' | 'prominent'

type RowShellV2Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  tone?: RowShellTone
  state?: RowShellState
  depth?: RowShellDepth
  interactive?: boolean
}

const RowShellV2 = forwardRef<HTMLDivElement, RowShellV2Props>(function RowShellV2(
  {
    children,
    className,
    tone = 'default',
    state = 'default',
    depth = 'primary',
    interactive = true,
    ...props
  }: RowShellV2Props,
  ref
) {
  return (
    <div
      {...props}
      ref={ref}
      className={cn(
        'v2-row-shell rounded-[var(--v2-control-radius)] border px-3 py-2.5 md:py-3',
        depth === 'embedded'
          ? 'v2-row-depth-embedded'
          : depth === 'prominent'
            ? 'v2-row-depth-prominent'
            : 'v2-row-depth-primary',
        interactive ? 'v2-row-interactive' : undefined,
        tone === 'muted' ? 'v2-row-tone-muted' : tone === 'inset' ? 'v2-row-tone-inset' : 'v2-row-tone-default',
        state === 'selection'
          ? 'v2-row-state-selected'
          : state === 'you'
            ? 'v2-row-state-you'
            : state === 'rival'
              ? 'v2-row-state-rival'
              : state === 'disabled'
                ? 'v2-row-state-disabled'
                : undefined,
        semanticSurfaceClass(state),
        className
      )}
      data-row-depth={depth}
      data-semantic-state={state}
    >
      {children}
    </div>
  )
})

export default RowShellV2
