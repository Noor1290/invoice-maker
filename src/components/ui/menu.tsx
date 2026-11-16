import * as React from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = 'end', ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-52 rounded-lg border border-line bg-white p-1 shadow-pop data-[state=open]:animate-in', className)}
        {...props}
      />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none',
        'data-[highlighted]:bg-band data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        danger ? 'text-danger data-[highlighted]:bg-danger-50' : 'text-ink [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
