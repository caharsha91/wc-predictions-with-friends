import { ExportsPanel } from './ExportsPage'

export default function AdminExportsPage() {
  return (
    <div className="stack">
      <div>
        <div className="sectionKicker">Backstage</div>
        <h1 className="h1">Exports</h1>
      </div>
      <div className="adminExports">
        <ExportsPanel embedded />
      </div>
    </div>
  )
}
