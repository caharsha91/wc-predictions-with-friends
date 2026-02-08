import { Button } from './Button'
import { ButtonLink } from './Button'
import { Card } from './Card'

export type DetailQuickMenuStat = {
  label: string
  value: string | number
}

export type DetailQuickMenuLink = {
  label: string
  to: string
  disabled?: boolean
}

type DetailQuickMenuProps = {
  title?: string
  subtitle?: string
  stats: DetailQuickMenuStat[]
  links: DetailQuickMenuLink[]
}

export default function DetailQuickMenu({
  title = 'Quick menu',
  subtitle = 'Navigation and completion stats',
  stats,
  links
}: DetailQuickMenuProps) {
  return (
    <Card className="rounded-2xl border-border/60 bg-transparent p-4 sm:p-5">
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/70 bg-bg2/40 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</div>
              <div className="text-sm font-semibold text-foreground">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          {links.map((link) =>
            link.disabled ? (
              <Button key={link.label} size="sm" variant="secondary" disabled className="w-full justify-start">
                {link.label}
              </Button>
            ) : (
              <ButtonLink
                key={link.label}
                size="sm"
                variant="secondary"
                to={link.to}
                className="w-full justify-start"
              >
                {link.label}
              </ButtonLink>
            )
          )}
        </div>
      </div>
    </Card>
  )
}
