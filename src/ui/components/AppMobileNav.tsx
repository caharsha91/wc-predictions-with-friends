import { NavLink } from 'react-router-dom'

import { useCurrentUser } from '../hooks/useCurrentUser'
import { cn } from '../lib/utils'
import { ADMIN_NAV, MAIN_NAV } from '../nav'
import BrandLogo from './BrandLogo'
import { Button } from './ui/Button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './ui/Sheet'

type AppMobileNavProps = {
  triggerLabel?: string
}

export default function AppMobileNav({ triggerLabel = 'Menu' }: AppMobileNavProps) {
  const user = useCurrentUser()
  const canAccessAdmin = user?.isAdmin === true

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" size="sm" aria-label="Open navigation" className="egg-pop-target">
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-[320px] border-r-0">
        <SheetHeader>
          <SheetTitle className="text-left">
            <BrandLogo size="sm" variant="full" />
          </SheetTitle>
          <SheetDescription>Move between picks, results, standings, and players.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-2 px-4 py-4">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon
            return (
              <SheetClose asChild key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      isActive
                        ? 'border-border1 bg-bg2 text-foreground'
                        : 'border-border/70 text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              </SheetClose>
            )
          })}

          {canAccessAdmin
            ? ADMIN_NAV.map((item) => {
                const Icon = item.icon
                return (
                  <SheetClose asChild key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                          isActive
                            ? 'border-border1 bg-bg2 text-foreground'
                            : 'border-border/70 text-muted-foreground hover:text-foreground'
                        )
                      }
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </NavLink>
                  </SheetClose>
                )
              })
            : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
