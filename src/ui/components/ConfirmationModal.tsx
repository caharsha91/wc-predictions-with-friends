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
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
  isLoading = false
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="admin-v2-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="admin-v2-modal w-full max-w-md overflow-hidden rounded-2xl border animate-in zoom-in-95 duration-200">
        <div className="admin-v2-modal-body p-6">
          <h3 className="admin-v2-modal-title text-lg font-semibold">{title}</h3>
          <div className="admin-v2-modal-description mt-2 text-sm">{description}</div>
        </div>
        <div className="admin-v2-modal-footer flex items-center justify-end gap-3 px-6 py-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="admin-v2-modal-cancel rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`admin-v2-modal-confirm rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              isDestructive ? 'admin-v2-modal-confirm-danger' : 'admin-v2-modal-confirm-default'
            }`}
          >
            {isLoading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
