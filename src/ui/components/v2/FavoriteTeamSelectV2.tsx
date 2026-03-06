import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'
import {
  buildCanonicalTeamOptions,
  normalizeFavoriteTeamCode,
  resolveTeamFlagMeta,
  UNKNOWN_FLAG_ASSET_PATH
} from '../../lib/teamFlag'
import FlagBadgeV2 from './FlagBadgeV2'
import RowShellV2 from './RowShellV2'
import StatusTagV2 from './StatusTagV2'

type FavoriteTeamSelectV2Props = {
  value?: string | null
  onChange: (nextFavoriteTeamCode: string | null) => void
  disabled?: boolean
  loading?: boolean
  variant?: 'default' | 'sidebar'
  menuPlacement?: 'bottom' | 'top'
  className?: string
}

type SelectOption = {
  code: string | null
  name: string
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

export default function FavoriteTeamSelectV2({
  value,
  onChange,
  disabled = false,
  loading = false,
  variant = 'default',
  menuPlacement = 'bottom',
  className
}: FavoriteTeamSelectV2Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const canonicalValue = normalizeFavoriteTeamCode(value)

  const options = useMemo(() => {
    return buildCanonicalTeamOptions()
  }, [])

  const filteredOptions = useMemo(() => {
    const queryValue = normalizeSearchValue(query)
    if (!queryValue) return options

    return options.filter((option) => {
      const codeMatch = option.code.toLowerCase().includes(queryValue)
      const nameMatch = option.name.toLowerCase().includes(queryValue)
      return codeMatch || nameMatch
    })
  }, [options, query])

  const selectOptions = useMemo<SelectOption[]>(() => {
    return [{ code: null, name: 'No favorite team' }, ...filteredOptions]
  }, [filteredOptions])

  const selectedOption = useMemo(() => {
    if (!canonicalValue) return null
    return options.find((option) => option.code === canonicalValue) ?? null
  }, [canonicalValue, options])

  const selectedMeta = useMemo(
    () =>
      resolveTeamFlagMeta({
        code: canonicalValue,
        name: selectedOption?.name ?? null,
        label: selectedOption?.name ?? 'No favorite team selected'
      }),
    [canonicalValue, selectedOption?.name]
  )

  useEffect(() => {
    if (!open) return

    function handleOutsidePointerDown(event: MouseEvent) {
      if (!containerRef.current) return
      const target = event.target as Node
      if (containerRef.current.contains(target)) return
      setOpen(false)
      setQuery('')
      setActiveIndex(0)
    }

    window.addEventListener('mousedown', handleOutsidePointerDown)
    return () => window.removeEventListener('mousedown', handleOutsidePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }, [open])

  useEffect(() => {
    setActiveIndex((current) => {
      if (selectOptions.length === 0) return 0
      return Math.min(current, selectOptions.length - 1)
    })
  }, [selectOptions.length])

  function openSelect() {
    if (disabled || loading) return
    setOpen(true)
    setQuery('')
    setActiveIndex(0)
  }

  function closeSelect() {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  function commitSelection(option: SelectOption) {
    onChange(option.code)
    closeSelect()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSelect()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, selectOptions.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(0, current - 1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const option = selectOptions[activeIndex]
      if (!option) return
      commitSelection(option)
    }
  }

  const menuPositionClass =
    menuPlacement === 'top'
      ? 'bottom-[calc(100%+0.4rem)]'
      : 'top-[calc(100%+0.4rem)]'
  const isSidebarVariant = variant === 'sidebar'

  const triggerClassName = cn(
    'flex w-full items-center justify-between gap-2 rounded-[var(--v2-control-radius)] text-left',
    isSidebarVariant
      ? 'account-menu-favorite-trigger px-[calc(var(--v2-control-pad-x-sm)-1px)] py-1.5'
      : 'v2-row-shell v2-row-interactive border px-2.5 py-2',
    open && !isSidebarVariant ? 'v2-row-state-selected border-[color:var(--v2-row-active-border)]' : undefined,
    open && isSidebarVariant ? 'account-menu-favorite-trigger-open' : undefined,
    disabled || loading ? 'cursor-not-allowed opacity-70' : undefined
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          if (open) closeSelect()
          else openSelect()
        }}
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FlagBadgeV2
            src={selectedMeta.assetPath}
            fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
            size="sm"
            imageClassName="h-full w-full object-cover"
          />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {selectedMeta.textPrimary}
              {selectedMeta.kind === 'canonical' && selectedOption?.name ? (
                <span className="ml-1 text-muted-foreground">{selectedOption.name}</span>
              ) : null}
            </div>
          </div>
        </div>

        {isSidebarVariant ? (
          <span className="account-menu-favorite-action">
            {loading ? 'Saving...' : open ? 'Close' : 'Edit'}
          </span>
        ) : (
          <StatusTagV2 tone={loading ? 'warning' : 'secondary'}>
            {loading ? 'Saving...' : open ? 'Close' : 'Search'}
          </StatusTagV2>
        )}
      </button>

      {open ? (
        <div
          className={cn(
            'absolute left-0 right-0 z-30 rounded-[var(--overlay-radius)] border border-[var(--overlay-border-soft)] bg-[var(--overlay-surface-elevated)] p-2 shadow-[var(--overlay-shadow)] backdrop-blur-md',
            isSidebarVariant ? 'account-menu-favorite-popover' : undefined,
            menuPositionClass
          )}
        >
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search by code or team name"
            className="h-9"
          />

          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label="Favorite team options">
            {selectOptions.length === 0 ? (
              <RowShellV2 tone="inset" state="disabled" interactive={false} className="px-2 py-2 text-[12px] text-muted-foreground">
                No teams match your search.
              </RowShellV2>
            ) : (
              selectOptions.map((option, index) => {
                const isSelected = (option.code ?? null) === (canonicalValue ?? null)
                const isActive = index === activeIndex
                const optionMeta = resolveTeamFlagMeta({
                  code: option.code,
                  name: option.name,
                  label: option.name
                })

                return (
                  <button
                    key={option.code ?? 'no-favorite-team'}
                    type="button"
                    className="w-full text-left"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commitSelection(option)}
                  >
                    <RowShellV2
                      state={isSelected || isActive ? 'selected' : 'default'}
                      interactive
                      className="px-2 py-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FlagBadgeV2
                            src={optionMeta.assetPath}
                            fallbackSrc={UNKNOWN_FLAG_ASSET_PATH}
                            size="sm"
                            imageClassName="h-full w-full object-cover"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-foreground">
                              {optionMeta.kind === 'canonical' && option.code ? option.code : optionMeta.textPrimary}
                            </div>
                            <div className="truncate text-[12px] text-muted-foreground">{option.name}</div>
                          </div>
                        </div>
                        {isSelected ? (
                          isSidebarVariant ? (
                            <span className="account-menu-favorite-selected">Selected ✓</span>
                          ) : (
                            <StatusTagV2 tone="info">Selected</StatusTagV2>
                          )
                        ) : null}
                      </div>
                    </RowShellV2>
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
