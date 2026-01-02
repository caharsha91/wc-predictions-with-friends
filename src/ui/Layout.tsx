import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

import UserInfo from './components/UserInfo'
import { AppShellProvider, useAppShell } from './components/AppShellContext'
import {
  BracketIcon,
  CalendarIcon,
  ExportIcon,
  HomeIcon,
  ResultsIcon,
  ThemeIcon,
  TrophyIcon,
  UsersIcon
} from './components/Icons'
import { Button } from './components/ui/Button'
import { useCurrentUser } from './hooks/useCurrentUser'
import { useAuthState } from './hooks/useAuthState'
import { useSimulationState } from './hooks/useSimulationState'
import { firebaseAuth, hasFirebase } from '../lib/firebase'
import { useTheme } from '../theme/ThemeProvider'
import { getThemeById } from '../theme/themes'

const PAGE_TITLES: Record<string, string> = {
  home: 'Home',
  upcoming: 'Upcoming',
  results: 'Results',
  bracket: 'Bracket',
  leaderboard: 'Leaderboard',
  themes: 'Themes',
  users: 'Users',
  simulation: 'Simulation',
  exports: 'Exports'
}

const PAGE_TAGLINES: Record<string, string> = {
  upcoming: 'Make your picks. Beat your friends. Own the chat.',
  bracket: 'Lock it in—then talk your talk.',
  leaderboard: 'Where friendships go to overtime.'
}

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/upcoming', label: 'Upcoming', icon: CalendarIcon },
  { to: '/results', label: 'Results', icon: ResultsIcon },
  { to: '/bracket', label: 'Bracket', icon: BracketIcon },
  { to: '/leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { to: '/themes', label: 'Themes', icon: ThemeIcon },
  { to: '/users', label: 'Users', icon: UsersIcon, adminOnly: true },
  { to: '/exports', label: 'Exports', icon: ExportIcon, adminOnly: true }
]

const ABOUT_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a'
]

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  duration: number
  hue: number
  rotate: number
  fall: number
}

const CONFETTI_PIECES: ConfettiPiece[] = Array.from({ length: 28 }, (_, index) => ({
  id: index,
  left: 6 + Math.random() * 88,
  delay: Math.random() * 0.2,
  duration: 1.1 + Math.random() * 0.9,
  hue: Math.floor(Math.random() * 360),
  rotate: Math.random() * 360,
  fall: 70 + Math.random() * 40
}))

function LayoutFrame() {
  const user = useCurrentUser()
  const authState = useAuthState()
  const simulation = useSimulationState()
  const [authError, setAuthError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [confettiVisible, setConfettiVisible] = useState(false)
  const [confettiSeed, setConfettiSeed] = useState(0)
  const [nerdToast, setNerdToast] = useState(false)
  const aboutIndexRef = useRef(0)
  const logoClickCountRef = useRef(0)
  const longPressTimerRef = useRef<number | null>(null)
  const logoClickTimerRef = useRef<number | null>(null)
  const confettiTimerRef = useRef<number | null>(null)
  const nerdToastTimerRef = useRef<number | null>(null)
  const canAccessAdmin = simulation.enabled || user?.isAdmin
  const location = useLocation()
  const appShell = useAppShell()
  const topBarAction = appShell?.topBarAction ?? null
  const routeKey = location.pathname.split('/')[1] || 'home'
  const pageTitle = PAGE_TITLES[routeKey] ?? 'WC Predictions'
  const pageTagline =
    PAGE_TAGLINES[routeKey] ?? 'One league. Many opinions. One champion.'
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || canAccessAdmin)
  const { themeId, syncNotice } = useTheme()
  const themeMeta = getThemeById(themeId)

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      const tagName = target.tagName
      return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
    }

    function normalizeKey(key: string) {
      return key.length === 1 ? key.toLowerCase() : key
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && aboutOpen) {
        setAboutOpen(false)
        return
      }
      if (isEditableTarget(event.target)) return
      const key = normalizeKey(event.key)
      const expected = ABOUT_SEQUENCE[aboutIndexRef.current]
      if (key === expected) {
        aboutIndexRef.current += 1
        if (aboutIndexRef.current === ABOUT_SEQUENCE.length) {
          aboutIndexRef.current = 0
          setAboutOpen(true)
        }
        return
      }
      aboutIndexRef.current = key === ABOUT_SEQUENCE[0] ? 1 : 0
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [aboutOpen])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current)
      }
      if (logoClickTimerRef.current) {
        window.clearTimeout(logoClickTimerRef.current)
      }
      if (confettiTimerRef.current) {
        window.clearTimeout(confettiTimerRef.current)
      }
      if (nerdToastTimerRef.current) {
        window.clearTimeout(nerdToastTimerRef.current)
      }
    }
  }, [])

  function startLogoLongPress() {
    if (longPressTimerRef.current) return
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null
      setAboutOpen(true)
    }, 2000)
  }

  function cancelLogoLongPress() {
    if (!longPressTimerRef.current) return
    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function resetLogoClickTimer() {
    if (!logoClickTimerRef.current) return
    window.clearTimeout(logoClickTimerRef.current)
    logoClickTimerRef.current = null
  }

  function triggerNerdEasterEgg() {
    setConfettiSeed((current) => current + 1)
    setConfettiVisible(true)
    setNerdToast(true)
    if (confettiTimerRef.current) {
      window.clearTimeout(confettiTimerRef.current)
    }
    if (nerdToastTimerRef.current) {
      window.clearTimeout(nerdToastTimerRef.current)
    }
    confettiTimerRef.current = window.setTimeout(() => {
      setConfettiVisible(false)
      confettiTimerRef.current = null
    }, 1800)
    nerdToastTimerRef.current = window.setTimeout(() => {
      setNerdToast(false)
      nerdToastTimerRef.current = null
    }, 2600)
  }

  function handleLogoClick() {
    resetLogoClickTimer()
    logoClickCountRef.current += 1
    if (logoClickCountRef.current >= 7) {
      logoClickCountRef.current = 0
      triggerNerdEasterEgg()
      return
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0
      logoClickTimerRef.current = null
    }, 2500)
  }

  async function handleSignIn() {
    if (!firebaseAuth) return
    setAuthError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(firebaseAuth, provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.'
      setAuthError(message)
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return
    setAuthError(null)
    try {
      await signOut(firebaseAuth)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign out.'
      setAuthError(message)
    }
  }

  return (
    <div className="appShell">
      {simulation.enabled ? (
        <div className="simulationBanner">SIMULATION MODE (LOCAL ONLY)</div>
      ) : null}
      <header className="header">
        <div className="headerBar">
          <div className="brandBlock">
            <div
              className="brandMark"
              aria-hidden="true"
              onClick={handleLogoClick}
              onPointerDown={startLogoLongPress}
              onPointerUp={cancelLogoLongPress}
              onPointerLeave={cancelLogoLongPress}
              onPointerCancel={cancelLogoLongPress}
            >
              WC
            </div>
            <div className="brandStack">
              <div className="brand">{pageTitle}</div>
              <div className="brandSub">{pageTagline}</div>
            </div>
          </div>
          <div className="headerActions">
            {topBarAction ? <div className="primaryActionSlot">{topBarAction}</div> : null}
            {hasFirebase && !simulation.enabled ? (
              authState.user ? null : (
                <Button size="sm" type="button" onClick={handleSignIn}>
                  Sign in
                </Button>
              )
            ) : null}
            {user?.name && user.email ? (
              <UserInfo
                name={user.name}
                email={user.email}
                isAdmin={user.isAdmin}
                onSignOut={
                  hasFirebase && !simulation.enabled && authState.user ? handleSignOut : undefined
                }
              />
            ) : null}
            {authError ? <span className="authErrorTag">{authError}</span> : null}
          </div>
        </div>
        <div className="headerNav">
          <nav className="navTabs">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink')}
                end={item.to === '/'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="headerMeta">
            <span className="metaTag">{themeMeta.name}</span>
            <span className="metaNote">{themeMeta.description}</span>
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {confettiVisible ? (
        <div className="confettiBurst" aria-hidden="true" key={confettiSeed}>
          {CONFETTI_PIECES.map((piece) => (
            <span
              key={piece.id}
              className="confettiPiece"
              style={
                {
                  '--confetti-left': `${piece.left}%`,
                  '--confetti-delay': `${piece.delay}s`,
                  '--confetti-duration': `${piece.duration}s`,
                  '--confetti-hue': piece.hue,
                  '--confetti-rotate': `${piece.rotate}deg`,
                  '--confetti-fall': `${piece.fall}vh`
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
      {nerdToast ? (
        <div className="nerdToast" role="status" aria-live="polite">
          Respectfully, you&apos;re a nerd.
        </div>
      ) : null}
      <div
        className={aboutOpen ? 'aboutScrim isVisible' : 'aboutScrim'}
        onClick={() => setAboutOpen(false)}
      />
      <div
        className="aboutDrawer"
        data-open={aboutOpen ? 'true' : 'false'}
        role={aboutOpen ? 'dialog' : undefined}
        aria-modal={aboutOpen ? 'true' : undefined}
        aria-labelledby="about-drawer-title"
        aria-describedby="about-drawer-body"
      >
        <div className="aboutDrawerTitle" id="about-drawer-title">
          About
        </div>
        <div className="aboutDrawerBody" id="about-drawer-body">
          Built by Harsha Copparam (caharsha2025@gmail.com) 2026
        </div>
        <div className="aboutDrawerActions">
          <Button size="sm" variant="ghost" onClick={() => setAboutOpen(false)}>
            Close
          </Button>
        </div>
      </div>
      {syncNotice ? (
        <div className="themeSyncToast" role="status" aria-live="polite">
          {syncNotice}
        </div>
      ) : null}
      <nav className="bottomNav" aria-label="Primary">
        <div className="bottomNavInner">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'bottomNavLink bottomNavLinkActive' : 'bottomNavLink'
                }
                end={item.to === '/'}
              >
                <span className="bottomNavIcon">
                  <Icon />
                </span>
                <span className="bottomNavLabel">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default function Layout() {
  return (
    <AppShellProvider>
      <LayoutFrame />
    </AppShellProvider>
  )
}
