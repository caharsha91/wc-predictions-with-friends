import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'

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
        <Button size="sm" variant="secondary" className="h-9 rounded-lg px-3 text-[12px]" disabled={disabled}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[292px] overflow-hidden rounded-xl border-border/75 p-0">
        <div className="space-y-3 px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Export</div>
          <div className="space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Scope</div>
              <div className="mt-0.5 text-[12px] leading-snug text-foreground">{scopeLabel}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Snapshot</div>
              <div className="mt-0.5 text-[12px] leading-snug text-foreground">{snapshotLabel}</div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{lockMessage}</p>
        </div>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem
          className="m-2 rounded-lg"
          onSelect={(event) => {
            event.preventDefault()
            onDownloadXlsx()
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-xs font-semibold text-foreground">Download XLSX</span>
            <span className="text-[11px] text-muted-foreground">Workbook export</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
