import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

export type PageShellV2Preset = 'default' | 'admin' | 'dense'

type PageShellV2Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  preset?: PageShellV2Preset
  stickyOffset?: string
}

export default function PageShellV2({
  children,
  className,
  preset = 'default',
  stickyOffset,
  style,
  ...props
}: PageShellV2Props) {
  const presetClass =
    preset === 'admin'
      ? 'v2-page-shell-preset-admin'
      : preset === 'dense'
        ? 'v2-page-shell-preset-dense'
        : 'v2-page-shell-preset-default'

  const resolvedStyle: CSSProperties | undefined = stickyOffset
    ? ({ ...style, ['--v2-sticky-offset' as string]: stickyOffset } as CSSProperties)
    : style

  return (
    <div
      {...props}
      style={resolvedStyle}
      data-page-preset={preset}
      className={cn('v2-page-shell w-full', presetClass, className)}
    >
      {children}
    </div>
  )
}
