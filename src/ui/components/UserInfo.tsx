import { useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { NavLink } from 'react-router-dom'

type UserInfoProps = {
  name: string
  email: string
  isAdmin?: boolean
}

export default function UserInfo({ name, email, isAdmin }: UserInfoProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  if (!isAdmin) {
    return (
      <div className="userInfo">
        <div className="userName">{name}</div>
        <div className="userEmail">{email}</div>
      </div>
    )
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget as Node | null
    if (!containerRef.current || !nextTarget) {
      setOpen(false)
      return
    }
    if (!containerRef.current.contains(nextTarget)) {
      setOpen(false)
    }
  }

  return (
    <div className="userMenu" ref={containerRef} onBlur={handleBlur}>
      <button
        className="userMenuButton"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="userMenuText">
          <span className="userName">{name}</span>
          <span className="userEmail">{email}</span>
        </span>
        <span className="userMenuCaret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="userMenuList" role="menu">
          <NavLink className="userMenuItem" role="menuitem" to="/admin">
            Admin
          </NavLink>
        </div>
      ) : null}
    </div>
  )
}
