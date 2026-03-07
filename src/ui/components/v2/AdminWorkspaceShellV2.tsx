import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import PageHeaderV2 from './PageHeaderV2'
import type { PageHeaderV2Variant } from './PageHeaderV2'
import PageShellV2 from './PageShellV2'

type AdminWorkspaceShellV2Props = {
  title: string
  subtitle: ReactNode
  metadata?: ReactNode
  actions?: ReactNode
  kicker?: ReactNode
  variant?: PageHeaderV2Variant
  headerClassName?: string
  metadataClassName?: string
  children: ReactNode
}

export default function AdminWorkspaceShellV2({
  title,
  subtitle,
  metadata,
  actions,
  kicker = 'Admin',
  variant = 'hero',
  headerClassName,
  metadataClassName,
  children
}: AdminWorkspaceShellV2Props) {
  return (
    <PageShellV2 preset="admin" className="landing-v2-canvas">
      <PageHeaderV2
        variant={variant}
        className={cn(variant === 'hero' ? 'landing-v2-hero admin-v2-hero' : 'admin-v2-hero', headerClassName)}
        kicker={kicker}
        title={title}
        subtitle={subtitle}
        actions={actions}
        metadata={metadata}
        metadataClassName={metadataClassName}
      />
      {children}
    </PageShellV2>
  )
}
