import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

interface ContentProps extends React.ComponentProps<typeof D.Content> {
  hideClose?: boolean;
}

export function DialogContent({ className, children, hideClose, ...props }: ContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-navy-900/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
          'rounded-xl border border-line bg-white p-6 shadow-pop focus:outline-none data-[state=open]:animate-in',
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <D.Close
            className="absolute right-4 top-4 rounded-md p-1 text-muted hover:bg-band hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </D.Close>
        )}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 flex flex-col gap-1.5 pr-6', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof D.Title>) {
  return <D.Title className={cn('font-serif text-2xl text-navy', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof D.Description>) {
  return <D.Description className={cn('text-sm text-muted leading-relaxed', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}
