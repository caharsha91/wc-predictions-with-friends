import type { ReactNode } from 'react'

import { ButtonLink } from '../ui/Button'
import { resolveCompanionSafePath } from '../../lib/companionSurface'

type CompanionButtonLinkProps = {
  to: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'tertiary' | 'quiet' | 'pill' | 'pillSecondary'
  size?: 'xs' | 'sm' | 'md'
  className?: string
  icon?: ReactNode
}

export function CompanionButtonLink({ to, ...props }: CompanionButtonLinkProps) {
  return <ButtonLink {...props} to={resolveCompanionSafePath(to)} />
}
