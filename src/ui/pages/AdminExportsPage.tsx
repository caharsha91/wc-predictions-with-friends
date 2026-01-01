import { ExportsPanel } from './ExportsPage'
import PageHeader from '../components/ui/PageHeader'

export default function AdminExportsPage() {
  return (
    <div className="stack">
      <PageHeader kicker="Backstage" title="Exports" />
      <div className="adminExports">
        <ExportsPanel embedded />
      </div>
    </div>
  )
}
