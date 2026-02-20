import * as DialogPrimitive from '@radix-ui/react-dialog'
import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'

import { cn } from '../../lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-[var(--overlay-backdrop)] backdrop-blur-sm data-[state=open]:animate-fade-in',
        className
      )}
      {...props}
    />
  )
})
DialogOverlay.displayName = 'DialogOverlay'

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(function DialogContent({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--overlay-border)] bg-[var(--overlay-surface)] text-foreground shadow-[var(--overlay-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
})
DialogContent.displayName = 'DialogContent'

export function DialogHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('border-b border-border/60 px-5 py-4', className)} {...props} />
}

export function DialogTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold text-foreground', className)} {...props} />
}

export function DialogDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('mt-1 text-sm text-muted-foreground', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('border-t border-border/60 px-5 py-4', className)} {...props} />
}
