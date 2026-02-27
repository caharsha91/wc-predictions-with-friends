import { useMemo } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

type LegacyAdminTab = 'players' | 'exports' | 'demo' | 'controls'
type AdminSection = 'players' | 'exports' | 'controls'

const TAB_TO_SECTION: Record<LegacyAdminTab, AdminSection> = {
  players: 'players',
  exports: 'exports',
  demo: 'controls',
  controls: 'controls'
}

function normalizeLegacyTab(value: string | null | undefined): LegacyAdminTab | null {
  const next = value?.trim().toLowerCase()
  if (!next) return null
  if (next === 'players' || next === 'exports' || next === 'demo' || next === 'controls') {
    return next
  }
  return null
}

function resolveAdminSection(search: string, hash: string): AdminSection {
  const params = new URLSearchParams(search)
  const queryTab = normalizeLegacyTab(params.get('tab'))
  if (queryTab) return TAB_TO_SECTION[queryTab]

  const hashTab = normalizeLegacyTab(hash.replace(/^#/, ''))
  if (hashTab) return TAB_TO_SECTION[hashTab]

  return 'players'
}

export default function AdminConsolePage() {
  const location = useLocation()

  const targetSection = useMemo(
    () => resolveAdminSection(location.search, location.hash),
    [location.hash, location.search]
  )

  const basePath = location.pathname.startsWith('/demo/') ? '/demo/admin' : '/admin'
  return <Navigate to={`${basePath}/${targetSection}`} replace />
}
