import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 transition-colors ' +
  'hover:border-[#c3cad6] focus-visible:outline-none focus-visible:border-navy focus-visible:ring-3 focus-visible:ring-navy/15 ' +
  'disabled:cursor-not-allowed disabled:bg-band disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%235F6368%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-size-[16px] bg-position-[right_10px_center] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = 'NativeSelect';
