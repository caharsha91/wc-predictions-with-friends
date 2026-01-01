import type { ReactNode } from 'react'

type PageHeaderProps = {
  kicker?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

export default function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  className
}: PageHeaderProps) {
  return (
    <div className={['pageHeader', className].filter(Boolean).join(' ')}>
      <div className="pageHeaderTitle">
        {kicker ? <div className="sectionKicker">{kicker}</div> : null}
        <h1 className="h1">{title}</h1>
        {subtitle ? <div className="pageSubtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="pageHeaderActions">{actions}</div> : null}
    </div>
  )
}
