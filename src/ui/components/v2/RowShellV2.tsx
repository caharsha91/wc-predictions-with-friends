import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '../../lib/utils'

type RowShellTone = 'default' | 'muted' | 'inset'
type RowShellState = 'default' | 'selected' | 'you' | 'rival' | 'disabled'

type RowShellV2Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  tone?: RowShellTone
  state?: RowShellState
  interactive?: boolean
}

const RowShellV2 = forwardRef<HTMLDivElement, RowShellV2Props>(function RowShellV2(
  {
    children,
    className,
    tone = 'default',
    state = 'default',
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
        'v2-row-shell rounded-lg border px-3 py-2',
        interactive ? 'v2-row-interactive' : undefined,
        tone === 'muted' ? 'v2-row-tone-muted' : tone === 'inset' ? 'v2-row-tone-inset' : 'v2-row-tone-default',
        state === 'selected'
          ? 'v2-row-state-selected'
          : state === 'you'
            ? 'v2-row-state-you'
            : state === 'rival'
              ? 'v2-row-state-rival'
              : state === 'disabled'
                ? 'v2-row-state-disabled'
                : undefined,
        className
      )}
    >
      {children}
    </div>
  )
})

export default RowShellV2
