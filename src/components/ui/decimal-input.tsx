import * as React from 'react';
import { useEffect, useState } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onValueChange: (n: number) => void;
  decimals?: number;
}

function parse(s: string): number | null {
  const t = s.replace(/[,\s]/g, '').replace(/%$/, '');
  if (t === '' || t === '-') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function show(n: number, decimals?: number) {
  if (!Number.isFinite(n)) return '';
  if (decimals === undefined) return String(n);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Numeric text input: accepts "1,234.50", formats on blur, never shows NaN. */
export const DecimalInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onValueChange, decimals, className, onBlur, onFocus, ...rest }, ref) => {
    const [text, setText] = useState(() => show(value, decimals));
    const [focused, setFocused] = useState(false);
    const invalid = parse(text) === null;

    // Follow external changes (undo, autocomplete) when not typing.
    useEffect(() => {
      if (!focused && parse(text) !== value) setText(show(value, decimals));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, focused]);

    return (
      <Input
        ref={ref}
        inputMode="decimal"
        value={text}
        aria-invalid={invalid || rest['aria-invalid'] === true}
        className={cn('tabular text-right', className)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          if (n !== null) onValueChange(n);
        }}
        onFocus={(e) => {
          setFocused(true);
          if (value === 0 && decimals !== undefined) setText('');
          else setText(String(value));
          requestAnimationFrame(() => e.target.select());
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          const n = parse(text);
          setText(show(n ?? value, decimals));
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
DecimalInput.displayName = 'DecimalInput';
