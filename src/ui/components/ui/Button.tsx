import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-[var(--accent)] text-[var(--text-inverse)] shadow-soft hover:bg-[var(--accent-strong)]',
        secondary:
          'border-border/70 bg-[var(--surface-muted)] text-foreground hover:border-[var(--border-strong)]',
        ghost:
          'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:bg-[var(--surface-muted)]',
        pill:
          'border-[var(--border-accent)] bg-[var(--button-bg)] text-foreground shadow-[var(--shadow-xs)] hover:border-[var(--accent-strong)] hover:bg-[var(--accent-soft)] hover:shadow-[var(--shadow-sm)] data-[active=true]:border-[var(--accent-strong)] data-[active=true]:bg-[var(--accent-soft)] data-[active=true]:shadow-[var(--shadow-sm)] disabled:shadow-none'
      },
      size: {
        sm: 'h-9 px-3 text-xs',
        md: 'h-10 px-4 text-sm'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
)

type ButtonProps = VariantProps<typeof buttonVariants> &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean
    icon?: ReactNode
  }

type ButtonLinkProps = VariantProps<typeof buttonVariants> & LinkProps & { icon?: ReactNode }

export function Button({
  variant,
  size,
  loading = false,
  icon,
  className,
  type,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type ?? 'button'}
      className={cn(
        buttonVariants({ variant, size }),
        loading && 'cursor-wait',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-soft)] border-t-[var(--primary)]"
          aria-hidden="true"
        />
      ) : null}
      <span className="inline-flex items-center gap-2">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    </button>
  )
}

export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} className={cn(buttonVariants({ variant, size }), className)}>
      <span className="inline-flex items-center gap-2">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    </Link>
  )
}

export { buttonVariants }
