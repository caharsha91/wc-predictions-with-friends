import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[286px] overflow-hidden rounded-xl border-border/45 bg-background/92 p-2 backdrop-blur-md"
      >
        <div className="space-y-2.5 rounded-lg bg-bg2/20 px-2.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Export</div>
          <div className="space-y-1.5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Scope</div>
              <div className="mt-0.5 text-[12px] leading-snug text-foreground">{scopeLabel}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Snapshot</div>
              <div className="mt-0.5 text-[12px] leading-snug text-foreground">{snapshotLabel}</div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{lockMessage}</p>
        </div>
        <DropdownMenuItem
          className="mt-1 rounded-lg bg-background/45"
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
