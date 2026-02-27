import type { ReactNode } from 'react'

import PageHeaderV2 from './PageHeaderV2'
import PageShellV2 from './PageShellV2'

type AdminWorkspaceShellV2Props = {
  title: string
  subtitle: ReactNode
  metadata?: ReactNode
  kicker?: ReactNode
  children: ReactNode
}

export default function AdminWorkspaceShellV2({
  title,
  subtitle,
  metadata,
  kicker = 'Admin',
  children
}: AdminWorkspaceShellV2Props) {
  return (
    <PageShellV2 className="landing-v2-canvas p-4">
      <PageHeaderV2 variant="section" kicker={kicker} title={title} subtitle={subtitle} metadata={metadata} />
      {children}
    </PageShellV2>
  )
}
