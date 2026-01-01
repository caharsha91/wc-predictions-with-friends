import type { HTMLAttributes, ReactNode } from 'react'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
  as?: 'section' | 'div' | 'article'
}

type CardHeaderProps = {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

type CardSectionProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function Card({ children, className, as: Tag = 'section', ...props }: CardProps) {
  return (
    <Tag {...props} className={['card uiCard', className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, actions, children }: CardHeaderProps) {
  if (children) {
    return <div className="uiCardHeader">{children}</div>
  }
  return (
    <div className="uiCardHeader">
      <div className="uiCardHeaderTitle">
        {title ? <div className="sectionTitle">{title}</div> : null}
        {subtitle ? <div className="pageSubtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="uiCardHeaderActions">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ children, className, ...props }: CardSectionProps) {
  return (
    <div {...props} className={['uiCardBody', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className, ...props }: CardSectionProps) {
  return (
    <div {...props} className={['uiCardFooter', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}
