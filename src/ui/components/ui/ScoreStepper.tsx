import { Button } from './Button'

type ScoreStepperProps = {
  label: string
  value: number | null
  disabled?: boolean
  onChange: (next: number) => void
}

export default function ScoreStepper({ label, value, disabled = false, onChange }: ScoreStepperProps) {
  const safeValue = value ?? 0

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-11 w-11 rounded-xl p-0 text-base"
          aria-label={`Decrease ${label}`}
          disabled={disabled || safeValue <= 0}
          onClick={() => onChange(Math.max(0, safeValue - 1))}
        >
          -
        </Button>
        <div
          className="flex h-11 min-w-[3.25rem] items-center justify-center rounded-xl border border-border/70 bg-bg2 px-3 text-base font-semibold text-foreground"
          aria-live="polite"
          aria-label={`${label} value`}
        >
          {safeValue}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-11 w-11 rounded-xl p-0 text-base"
          aria-label={`Increase ${label}`}
          disabled={disabled}
          onClick={() => onChange(safeValue + 1)}
        >
          +
        </Button>
      </div>
    </div>
  )
}
