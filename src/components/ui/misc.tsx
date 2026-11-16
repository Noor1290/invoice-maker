import * as React from 'react';
import { Popover as P } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ───────── Card ─────────
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-white shadow-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-line px-6 py-5', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-serif text-xl text-navy', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5', className)} {...props} />;
}

// ───────── Badge ─────────
export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-band text-muted ring-line',
        navy: 'bg-navy-50 text-navy ring-navy/15',
        gold: 'bg-gold-50 text-gold-700 ring-gold/30',
        success: 'bg-success-50 text-success ring-success/20',
        warning: 'bg-warning-50 text-warning ring-warning/20',
        danger: 'bg-danger-50 text-danger ring-danger/20',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);
export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ───────── Callout ─────────
const calloutVariants = cva('flex gap-3 rounded-lg border px-4 py-3 text-sm leading-relaxed', {
  variants: {
    tone: {
      info: 'border-navy/15 bg-navy-50 text-navy',
      warning: 'border-warning/25 bg-warning-50 text-[#7a2e0e]',
      danger: 'border-danger/25 bg-danger-50 text-danger',
      success: 'border-success/25 bg-success-50 text-success',
    },
  },
  defaultVariants: { tone: 'info' },
});
export function Callout({
  className,
  tone,
  icon,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof calloutVariants> & { icon?: React.ReactNode }) {
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ───────── Popover ─────────
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;
export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-[min(92vw,26rem)] rounded-lg border border-line bg-white p-4 shadow-pop outline-none data-[state=open]:animate-in',
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}

// ───────── Segmented control (radio group) ─────────
interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  name: string;
  className?: string;
}
export function Segmented<T extends string>({ value, onChange, options, name, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className={cn('inline-flex rounded-lg border border-line bg-band p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
            value === o.value ? 'bg-white text-navy shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
