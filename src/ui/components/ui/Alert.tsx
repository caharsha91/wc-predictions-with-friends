import type { HTMLAttributes, ReactNode } from 'react'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone
  title?: ReactNode
  children: ReactNode
}

export function Alert({ tone = 'info', title, children, className, ...props }: AlertProps) {
  return (
    <div
      {...props}
      className={['alert', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <div className="alertTitle">{title}</div> : null}
      <div>{children}</div>
    </div>
  )
}
