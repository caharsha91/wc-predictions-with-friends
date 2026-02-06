import { useId } from 'react'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'

import { cn } from '../../lib/utils'

type FieldBaseProps = {
  label: string
  helperText?: string
  error?: string
  labelHidden?: boolean
  className?: string
}

type InputFieldProps = FieldBaseProps & InputHTMLAttributes<HTMLInputElement>
type SelectFieldProps = FieldBaseProps & SelectHTMLAttributes<HTMLSelectElement>
type TextareaFieldProps = FieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>

const baseFieldControlClass =
  'w-full rounded-md border border-input bg-[var(--input-bg)] px-3 py-2 text-sm text-foreground placeholder:text-fg2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60'

function useFieldIds(id?: string, helperText?: string, error?: string) {
  const fallbackId = useId()
  const fieldId = id ?? `field-${fallbackId}`
  const helperId = helperText ? `${fieldId}-help` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined

  return { fieldId, helperId, errorId, describedBy }
}

export function InputField({
  label,
  helperText,
  error,
  labelHidden,
  className,
  id,
  ...props
}: InputFieldProps) {
  const { fieldId, helperId, errorId, describedBy } = useFieldIds(id, helperText, error)
  return (
    <div className={cn('space-y-1', className)}>
      <label
        className={cn(
          'text-xs uppercase tracking-[0.22em] text-muted-foreground',
          labelHidden && 'sr-only'
        )}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        className={baseFieldControlClass}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
      {helperText ? (
        <div className="text-xs text-muted-foreground" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export function SelectField({
  label,
  helperText,
  error,
  labelHidden,
  className,
  id,
  children,
  ...props
}: SelectFieldProps) {
  const { fieldId, helperId, errorId, describedBy } = useFieldIds(id, helperText, error)
  return (
    <div className={cn('space-y-1', className)}>
      <label
        className={cn(
          'text-xs uppercase tracking-[0.22em] text-muted-foreground',
          labelHidden && 'sr-only'
        )}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <select
        {...props}
        id={fieldId}
        className={baseFieldControlClass}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      {helperText ? (
        <div className="text-xs text-muted-foreground" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}

export function TextareaField({
  label,
  helperText,
  error,
  labelHidden,
  className,
  id,
  ...props
}: TextareaFieldProps) {
  const { fieldId, helperId, errorId, describedBy } = useFieldIds(id, helperText, error)
  return (
    <div className={cn('space-y-1', className)}>
      <label
        className={cn(
          'text-xs uppercase tracking-[0.22em] text-muted-foreground',
          labelHidden && 'sr-only'
        )}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <textarea
        {...props}
        id={fieldId}
        className={cn('min-h-[96px]', baseFieldControlClass)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
      {helperText ? (
        <div className="text-xs text-muted-foreground" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
