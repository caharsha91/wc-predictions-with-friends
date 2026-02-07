import { useId } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'

import { cn } from '../lib/utils'

type BrandLogoSize = 'sm' | 'md' | 'lg'
type BrandLogoVariant = 'full' | 'mark'
type BrandLogoTone = 'default' | 'muted' | 'inverse'

type BrandLogoProps = {
  size?: BrandLogoSize
  variant?: BrandLogoVariant
  tone?: BrandLogoTone
  className?: string
  markButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>
} & HTMLAttributes<HTMLDivElement>

const SIZE_STYLES: Record<BrandLogoSize, { mark: string; title: string; subtitle: string; gap: string }> = {
  sm: {
    mark: 'h-8 w-8',
    title: 'text-xs tracking-[0.16em]',
    subtitle: 'text-[10px] tracking-[0.2em]',
    gap: 'gap-2'
  },
  md: {
    mark: 'h-10 w-10',
    title: 'text-sm tracking-[0.16em]',
    subtitle: 'text-[11px] tracking-[0.2em]',
    gap: 'gap-3'
  },
  lg: {
    mark: 'h-12 w-12',
    title: 'text-base tracking-[0.14em]',
    subtitle: 'text-xs tracking-[0.2em]',
    gap: 'gap-3'
  }
}

const TONE_STYLES: Record<BrandLogoTone, { title: string; subtitle: string; markBorder: string }> = {
  default: {
    title: 'text-foreground',
    subtitle: 'text-muted-foreground',
    markBorder: 'border-[var(--border-soft)]'
  },
  muted: {
    title: 'text-fg1',
    subtitle: 'text-fg2',
    markBorder: 'border-[var(--border)]'
  },
  inverse: {
    title: 'text-[var(--sidebar-nav-foreground)]',
    subtitle: 'text-[var(--sidebar-nav-muted)]',
    markBorder: 'border-[var(--sidebar-border)]'
  }
}

function BrandMark({ className }: { className?: string }) {
  const gradientId = useId()

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-lg border bg-[var(--surface-muted)] shadow-[var(--shadow0)]',
        className
      )}
    >
      <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradientId} x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--brand-primary)" />
            <stop offset="1" stopColor="var(--brand-secondary)" />
          </linearGradient>
        </defs>
        <path
          d="M14 44L22 20L30 36L38 20L46 44"
          stroke={`url(#${gradientId})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M47 18C43 14 37 14 33 18"
          stroke="var(--status-info)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export default function BrandLogo({
  size = 'md',
  variant = 'full',
  tone = 'default',
  className,
  markButtonProps,
  ...props
}: BrandLogoProps) {
  const sizeStyle = SIZE_STYLES[size]
  const toneStyle = TONE_STYLES[tone]
  const isInteractive = Boolean(markButtonProps)

  return (
    <div
      {...props}
      className={cn('inline-flex min-w-0 items-center', sizeStyle.gap, className)}
      aria-label="WC Predictions"
    >
      {isInteractive ? (
        <button
          type="button"
          {...markButtonProps}
          className={cn(
            'rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            markButtonProps?.className
          )}
          aria-label="WC Predictions logo"
        >
          <BrandMark className={cn(sizeStyle.mark, toneStyle.markBorder)} />
          <span className="sr-only">WC Predictions</span>
        </button>
      ) : (
        <BrandMark className={cn(sizeStyle.mark, toneStyle.markBorder)} />
      )}

      {variant === 'full' ? (
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate font-display font-semibold uppercase leading-none',
              sizeStyle.title,
              toneStyle.title
            )}
          >
            WC Predictions
          </span>
          <span
            className={cn(
              'mt-1 block truncate font-mono uppercase leading-none',
              sizeStyle.subtitle,
              toneStyle.subtitle
            )}
          >
            Private League
          </span>
        </span>
      ) : null}
    </div>
  )
}
