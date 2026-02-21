import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/utils'

type PageShellV2Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export default function PageShellV2({ children, className, ...props }: PageShellV2Props) {
  return (
    <div {...props} className={cn('v2-page-shell w-full space-y-4 md:space-y-5', className)}>
      {children}
    </div>
  )
}
