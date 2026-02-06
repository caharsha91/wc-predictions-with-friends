import * as AccordionPrimitive from '@radix-ui/react-accordion'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../lib/utils'

export const Accordion = AccordionPrimitive.Root

export function AccordionItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn('rounded-lg border border-border bg-card shadow-[var(--shadow0)]', className)}
      {...props}
    />
  )
}

export function AccordionTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.12em] text-foreground transition hover:bg-bg2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className
        )}
        {...props}
      />
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className={cn(
        'overflow-hidden border-t border-border px-4 py-3 text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
        className
      )}
      {...props}
    />
  )
}
