import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      variant: {
        primary:
          'border-[var(--primary-cta-border)] [background:var(--primary-cta-bg)] text-primary-foreground shadow-[var(--primary-cta-shadow)] hover:[background:var(--primary-cta-hover-bg)] active:translate-y-[1px]',
        secondary:
          'border-[var(--secondary-cta-border)] [background:var(--secondary-cta-bg)] text-foreground shadow-[var(--secondary-cta-shadow)] hover:[background:var(--secondary-cta-hover-bg)]',
        ghost:
          'border-transparent bg-transparent text-fg1 hover:border-border0 hover:bg-bg2 hover:text-foreground',
        pill:
          'border-border1 bg-[var(--accent-soft)] text-foreground shadow-[var(--shadow0)] hover:border-primary hover:bg-[var(--accent-soft)] hover:shadow-[var(--shadow1)] data-[active=true]:border-[var(--pill-active-border)] data-[active=true]:[background:var(--pill-active-bg)] data-[active=true]:shadow-[var(--pill-active-shadow)] disabled:shadow-none',
        pillSecondary:
          'border-[rgba(var(--secondary-rgb),0.58)] bg-[rgba(var(--secondary-rgb),0.2)] text-foreground shadow-[var(--shadow0)] hover:border-secondary hover:bg-[rgba(var(--secondary-rgb),0.26)] hover:shadow-[var(--shadow1)] data-[active=true]:border-secondary data-[active=true]:bg-[rgba(var(--secondary-rgb),0.3)] data-[active=true]:shadow-[var(--shadow1)] disabled:shadow-none'
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading = false, icon, className, type, disabled, children, ...props },
  ref
) {
  return (
    <button
      {...props}
      ref={ref}
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
          className="h-4 w-4 animate-spin rounded-full border-2 border-current/40 border-t-current"
          aria-hidden="true"
        />
      ) : null}
      <span className="inline-flex items-center gap-2">
        {icon ? <span aria-hidden="true">{icon}</span> : null}
        {children}
      </span>
    </button>
  )
})

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
