import { Button } from '../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/DropdownMenu'
import {
  EXPORT_MENU_ACTION_HINT,
  EXPORT_MENU_ACTION_LABEL,
  EXPORT_MENU_TITLE
} from '../../lib/pageStatusCopy'

type ExportMenuV2Props = {
  description: string
  title?: string
  actionLabel?: string
  actionHint?: string
  onAction: () => void
  disabled?: boolean
}

export default function ExportMenuV2({
  description,
  title = EXPORT_MENU_TITLE,
  actionLabel = EXPORT_MENU_ACTION_LABEL,
  actionHint = EXPORT_MENU_ACTION_HINT,
  onAction,
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
        <div className="space-y-1 px-2.5 py-2">
          <div className="v2-type-kicker">{title}</div>
          <p className="v2-type-body-sm leading-snug text-foreground">{description}</p>
        </div>
        <DropdownMenuItem
          className="mt-1"
          onSelect={(event) => {
            event.preventDefault()
            onAction()
          }}
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-foreground">{actionLabel}</span>
            <span className="v2-type-caption">{actionHint}</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
