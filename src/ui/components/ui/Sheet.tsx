import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export function SheetOverlay({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in',
        className
      )}
      {...props}
    />
  )
}

export function SheetContent({
  className,
  side = 'right',
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const sideClasses: Record<string, string> = {
    top: 'inset-x-0 top-0 border-b pt-[env(safe-area-inset-top)]',
    bottom: 'inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]',
    left: 'inset-y-0 left-0 h-full w-[92vw] max-w-sm border-r',
    right: 'inset-y-0 right-0 h-full w-[92vw] max-w-sm border-l'
  }

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-card text-card-foreground shadow-soft',
          sideClasses[side],
          className
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

export function SheetHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('border-b border-border/60 px-4 py-3', className)} {...props} />
  )
}

export function SheetTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-sm font-semibold uppercase tracking-[0.18em]', className)}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export function SheetFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-auto border-t border-border/60 px-4 py-3', className)} {...props} />
  )
}
