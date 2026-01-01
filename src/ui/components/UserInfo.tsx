import { useEffect, useId, useRef, useState } from 'react'

import { Badge } from './ui/Badge'

type UserInfoProps = {
  name: string
  email: string
  isAdmin?: boolean
  onSignOut?: () => void
}

export default function UserInfo({ name, email, isAdmin, onSignOut }: UserInfoProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const summary = (
    <div className="userMenuText">
      <div className="userMenuTitleRow">
        <span className="userName">{name}</span>
        {isAdmin ? (
          <Badge className="userMenuBadge" tone="info">
            Admin
          </Badge>
        ) : null}
      </div>
      <span className="userEmail">{email}</span>
    </div>
  )

  if (!onSignOut) {
    return (
      <div className="userInfo">
        <div className="userSummary">{summary}</div>
      </div>
    )
  }

  return (
    <div className="userInfo">
      <div className="userMenu" ref={menuRef}>
        <button
          className="userMenuButton"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
          ref={buttonRef}
        >
          {summary}
          <span className="userMenuCaret" aria-hidden="true">
            ▾
          </span>
        </button>
        {open ? (
          <div className="userMenuList" role="menu" id={menuId}>
            <button
              type="button"
              className="userMenuItem userMenuItemButton"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onSignOut()
              }}
            >
              <span>Sign out</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
