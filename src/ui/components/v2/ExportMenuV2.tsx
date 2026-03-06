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
        <Button size="sm" variant="secondary" disabled={disabled}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[290px]"
      >
        <div className="space-y-1.5 rounded-[var(--v2-control-radius)] border border-[var(--overlay-divider)] bg-[color:color-mix(in_srgb,var(--surface-2)_68%,transparent)] px-2.5 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workbook export
          </div>
          <p className="text-[12px] leading-snug text-foreground">{contextLabel}</p>
          {snapshotLabel ? (
            <p className="text-[12px] leading-snug text-muted-foreground">{snapshotLabel}</p>
          ) : null}
        </div>
        <DropdownMenuItem
          className="mt-1 border-[var(--overlay-divider)] bg-[color:color-mix(in_srgb,var(--background)_58%,transparent)]"
          onSelect={(event) => {
            event.preventDefault()
            onDownloadXlsx()
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-foreground">Download .xlsx now</span>
            <span className="text-[12px] text-muted-foreground">Click to start the file download</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
