import { useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Card } from '../components/ui/Card'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/Tabs'
import AdminExportsPage from './AdminExportsPage'
import AdminUsersPage from './AdminUsersPage'
import DemoControlsPage from './DemoControlsPage'

type AdminConsoleTab = 'players' | 'exports' | 'demo'

const TAB_VALUES: AdminConsoleTab[] = ['players', 'exports', 'demo']

function isAdminConsoleTab(value: string | null | undefined): value is AdminConsoleTab {
  if (!value) return false
  return TAB_VALUES.includes(value as AdminConsoleTab)
}

function resolveTab(search: string, hash: string): AdminConsoleTab {
  const params = new URLSearchParams(search)
  const queryTab = params.get('tab')
  if (isAdminConsoleTab(queryTab)) return queryTab

  const hashTab = hash.replace('#', '')
  if (isAdminConsoleTab(hashTab)) return hashTab

  return 'players'
}

export default function AdminConsolePage() {
  const navigate = useNavigate()
  const location = useLocation()

  const activeTab = useMemo(
    () => resolveTab(location.search, location.hash),
    [location.hash, location.search]
  )

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const queryTab = params.get('tab')
    const hashTab = location.hash.replace('#', '')
    if (queryTab === activeTab && hashTab === activeTab) return

    params.set('tab', activeTab)
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
        hash: `#${activeTab}`
      },
      { replace: true }
    )
  }, [activeTab, location.hash, location.pathname, location.search, navigate])

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60 p-3 sm:p-4">
        <Tabs
          value={activeTab}
          onValueChange={(nextValue) => {
            if (!isAdminConsoleTab(nextValue)) return
            const params = new URLSearchParams(location.search)
            params.set('tab', nextValue)
            navigate(
              {
                pathname: location.pathname,
                search: `?${params.toString()}`,
                hash: `#${nextValue}`
              },
              { replace: false }
            )
          }}
        >
          <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-bg2 p-1">
            <TabsTrigger value="players" aria-label="Open players admin tab">
              Players
            </TabsTrigger>
            <TabsTrigger value="exports" aria-label="Open exports admin tab">
              Exports
            </TabsTrigger>
            <TabsTrigger value="demo" aria-label="Open demo controls admin tab">
              Demo Controls
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {activeTab === 'players' ? <AdminUsersPage /> : null}
      {activeTab === 'exports' ? <AdminExportsPage /> : null}
      {activeTab === 'demo' ? <DemoControlsPage /> : null}
    </div>
  )
}
