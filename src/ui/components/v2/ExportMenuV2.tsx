import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'

type ExportMenuV2Props = {
  contextLabel: string
  snapshotLabel?: string
  onDownloadXlsx: () => void
  disabled?: boolean
}

export default function ExportMenuV2({
  contextLabel,
  snapshotLabel,
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
        className="w-[280px] overflow-hidden rounded-xl border-border/35 bg-background/94 p-2 backdrop-blur-md"
      >
        <div className="space-y-1.5 rounded-lg bg-bg2/16 px-2.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workbook export
          </div>
          <p className="text-[12px] leading-snug text-foreground">{contextLabel}</p>
          {snapshotLabel ? (
            <p className="text-[11px] leading-snug text-muted-foreground">{snapshotLabel}</p>
          ) : null}
        </div>
        <DropdownMenuItem
          className="mt-1 rounded-lg border border-border/45 bg-background/50 data-[highlighted]:border-border/70 data-[highlighted]:bg-bg2/40"
          onSelect={(event) => {
            event.preventDefault()
            onDownloadXlsx()
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-foreground">Download .xlsx now</span>
            <span className="text-[11px] text-muted-foreground">Click to start the file download</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
