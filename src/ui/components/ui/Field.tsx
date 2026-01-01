import { useId } from 'react'
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from 'react'

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
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label
        className={['fieldLabel', labelHidden && 'sr-only'].filter(Boolean).join(' ')}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        className="fieldControl"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
      {helperText ? (
        <div className="fieldHelper" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="fieldError" id={errorId} role="alert">
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
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label
        className={['fieldLabel', labelHidden && 'sr-only'].filter(Boolean).join(' ')}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <select
        {...props}
        id={fieldId}
        className="fieldControl"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      >
        {children}
      </select>
      {helperText ? (
        <div className="fieldHelper" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="fieldError" id={errorId} role="alert">
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
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label
        className={['fieldLabel', labelHidden && 'sr-only'].filter(Boolean).join(' ')}
        htmlFor={fieldId}
      >
        {label}
      </label>
      <textarea
        {...props}
        id={fieldId}
        className="fieldControl"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
      {helperText ? (
        <div className="fieldHelper" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {error ? (
        <div className="fieldError" id={errorId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  )
}
