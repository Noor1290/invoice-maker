import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';

interface Props<T> extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (v: string) => void;
  fetchItems: (q: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onSelectItem: (item: T) => void;
  /** Optional extra row at the bottom of the list (e.g. "+ New client"). */
  footer?: { label: React.ReactNode; onSelect: () => void } | null;
  inputClassName?: string;
}

/**
 * Accessible combobox (WAI-ARIA 1.2 pattern): type to filter, ↑/↓ to move, Enter to pick, Esc to close.
 * When the list is closed, Enter is left alone so parent handlers (e.g. "add line") still work.
 */
function AutocompleteInner<T>(
  { value, onValueChange, fetchItems, itemKey, renderItem, onSelectItem, footer, className, inputClassName, onKeyDown, onBlur, onFocus, ...rest }: Props<T>,
  ref: React.ForwardedRef<HTMLInputElement>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const listId = useId();
  const reqRef = useRef(0);

  useEffect(() => {
    if (!focused) return;
    const req = ++reqRef.current;
    const q = value.trim();
    if (!q) {
      setItems([]);
      return;
    }
    void fetchItems(q).then((res) => {
      if (req !== reqRef.current) return;
      setItems(res);
      setActive(-1);
    });
  }, [value, focused, fetchItems]);

  const total = items.length + (footer ? 1 : 0);
  const show = open && focused && total > 0;

  function choose(index: number) {
    if (index < items.length) onSelectItem(items[index]);
    else footer?.onSelect();
    setOpen(false);
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        className={inputClassName}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !e.altKey) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (total ? (a + 1) % total : -1));
            return;
          }
          if (e.key === 'ArrowUp' && show && !e.altKey) {
            e.preventDefault();
            setActive((a) => (a <= 0 ? total - 1 : a - 1));
            return;
          }
          if (e.key === 'Enter' && show && active >= 0 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            choose(active);
            return;
          }
          if (e.key === 'Escape' && show) {
            e.preventDefault();
            setOpen(false);
            return;
          }
          onKeyDown?.(e);
        }}
        {...rest}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-pop"
        >
          {items.map((item, i) => (
            <li
              key={itemKey(item)}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={cn('cursor-pointer rounded-md px-2.5 py-2 text-sm', i === active ? 'bg-navy-50' : '')}
            >
              {renderItem(item)}
            </li>
          ))}
          {footer && (
            <li
              id={`${listId}-${items.length}`}
              role="option"
              aria-selected={active === items.length}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(items.length)}
              onClick={() => choose(items.length)}
              className={cn(
                'cursor-pointer rounded-md border-t border-line px-2.5 py-2 text-sm font-medium text-navy',
                active === items.length ? 'bg-navy-50' : '',
              )}
            >
              {footer.label}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export const Autocomplete = React.forwardRef(AutocompleteInner) as <T>(
  p: Props<T> & { ref?: React.ForwardedRef<HTMLInputElement> },
) => React.ReactElement;
