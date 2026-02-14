import { type ReactNode } from 'react'

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isDestructive?: boolean
  isLoading?: boolean
}

export default function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
  isLoading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            {description}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 bg-[var(--surface-muted)]/50 px-6 py-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 ${
              isDestructive
                ? 'bg-[rgb(var(--danger-rgb))] hover:bg-[rgba(var(--danger-rgb),0.9)]'
                : 'bg-[rgb(var(--primary-rgb))] hover:bg-[rgba(var(--primary-rgb),0.9)]'
            }`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}