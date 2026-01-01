import { useEffect, useRef, useState } from 'react'

import { useTheme } from '../../theme/ThemeProvider'
import { Badge } from './ui/Badge'

type UserInfoProps = {
  name: string
  email: string
  isAdmin?: boolean
}

export default function UserInfo({ name, email, isAdmin }: UserInfoProps) {
  const { mode, setMode } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  function handleToggleMode() {
    setMode(mode === 'dark' ? 'light' : 'dark')
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current) return
      if (menuRef.current.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="userInfo" ref={menuRef}>
      <div className="userMenu">
        <button
          className="userMenuButton"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
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
          <span className="userMenuCaret" aria-hidden="true">
            ▾
          </span>
        </button>
        {menuOpen ? (
          <div className="userMenuList" role="menu">
            <button
              className="userMenuItem userMenuItemButton"
              type="button"
              role="menuitemcheckbox"
              aria-checked={mode === 'dark'}
              onClick={handleToggleMode}
            >
              <span>Theme</span>
              <span className="userMenuToggle">
                <span className="userMenuToggleLabel">{mode === 'dark' ? 'Dark' : 'Light'}</span>
                <span className="userMenuToggleTrack">
                  <span className="userMenuToggleThumb" />
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
