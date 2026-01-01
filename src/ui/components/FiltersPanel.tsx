import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { CloseIcon } from './Icons'

type FiltersPanelProps = {
  id?: string
  title: string
  subtitle?: string
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  children: ReactNode
}

export default function FiltersPanel({
  id,
  title,
  subtitle,
  isOpen,
  isCollapsed,
  onClose,
  children
}: FiltersPanelProps) {
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      <div
        className={isOpen ? 'filtersScrim isVisible' : 'filtersScrim'}
        aria-hidden="true"
        onClick={onClose}
      />
      <section
        id={id}
        className="filtersPanel"
        data-open={isOpen ? 'true' : 'false'}
        data-collapsed={isCollapsed ? 'true' : 'false'}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? 'true' : undefined}
        aria-label={title}
      >
        <div className="filtersPanelHeader">
          <div>
            <div className="filtersPanelTitle">{title}</div>
            {subtitle ? <div className="filtersPanelSubtitle">{subtitle}</div> : null}
          </div>
          <button
            className="iconButton filtersPanelClose"
            type="button"
            aria-label="Close filters"
            onClick={onClose}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="filtersPanelBody">{children}</div>
      </section>
    </>
  )
}
