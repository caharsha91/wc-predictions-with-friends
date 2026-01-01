import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md'

type BaseButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

type ButtonProps = BaseButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean
    icon?: ReactNode
  }

type ButtonLinkProps = BaseButtonProps & LinkProps & { icon?: ReactNode }

function getButtonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
  loading?: boolean
) {
  return [
    'button',
    variant === 'secondary' && 'buttonSecondary',
    variant === 'ghost' && 'buttonGhost',
    size === 'sm' && 'buttonSmall',
    loading && 'buttonLoading',
    className
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  type,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = getButtonClassName(variant, size, className, loading)
  return (
    <button
      {...props}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="buttonSpinner" aria-hidden="true" /> : null}
      <span className="buttonLabel">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  const classes = getButtonClassName(variant, size, className)
  return (
    <Link {...props} className={classes}>
      <span className="buttonLabel">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    </Link>
  )
}
