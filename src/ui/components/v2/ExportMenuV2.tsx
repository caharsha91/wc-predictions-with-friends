import { Button } from '../ui/Button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/DropdownMenu'

type ExportMenuV2Props = {
  scopeLabel: string
  snapshotLabel: string
  lockMessage: string
  onDownloadXlsx: () => void
  disabled?: boolean
}

export default function ExportMenuV2({
  scopeLabel,
  snapshotLabel,
  lockMessage,
  onDownloadXlsx,
  disabled = false
}: ExportMenuV2Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className="h-8 rounded-lg px-3 text-[12px]" disabled={disabled}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[260px] p-2">
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
          <div className="uppercase tracking-wide text-[10px]">Scope</div>
          <div className="mt-1 text-foreground">{scopeLabel}</div>
          <div className="mt-2 uppercase tracking-wide text-[10px]">Snapshot</div>
          <div className="mt-1 text-foreground">{snapshotLabel}</div>
          <div className="mt-2 text-[10px]">{lockMessage}</div>
        </div>
        <DropdownMenuItem
          className="mt-1"
            onSelect={(event) => {
              event.preventDefault()
              onDownloadXlsx()
            }}
          >
          Download XLSX
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
