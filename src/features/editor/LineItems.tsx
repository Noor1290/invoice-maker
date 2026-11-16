import { useCallback, useRef, useState } from 'react';
import { Controller, useFieldArray, useWatch, type Control, type UseFormReturn } from 'react-hook-form';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Autocomplete } from '@/components/ui/autocomplete';
import type { AppSettings, Product } from '@/db/types';
import { searchProducts } from '@/db/recordsRepo';
import { newLine } from '@/lib/invoiceFactory';
import { formatAmount, formatMoney, lineTotals } from '@/lib/money';
import { cn } from '@/lib/utils';
import { fieldId, type InvoiceForm } from './formSchema';

interface Props {
  form: UseFormReturn<InvoiceForm>;
  settings: AppSettings;
  locked: boolean;
}

export function focusField(path: string) {
  const el = document.getElementById(fieldId(path)) as HTMLInputElement | null;
  if (el) {
    el.focus();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  return !!el;
}

export function LineItems({ form, settings, locked }: Props) {
  const { control } = form;
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: 'lines', keyName: 'key' });
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const currency = useWatch({ control, name: 'currency' });

  const addLine = useCallback(
    (at?: number) => {
      const line = newLine(settings);
      if (at === undefined) append(line, { shouldFocus: false });
      else insert(at, line, { shouldFocus: false });
      const idx = at ?? form.getValues('lines').length - 1;
      requestAnimationFrame(() => focusField(`lines.${idx}.description`));
    },
    [append, insert, form, settings],
  );

  const onRowKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if (locked || e.defaultPrevented) return;
    const tag = (e.target as HTMLElement).tagName;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && tag !== 'TEXTAREA') {
      e.preventDefault();
      if (i === fields.length - 1) addLine();
      else focusField(`lines.${i + 1}.description`);
    } else if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (fields.length === 1) {
        form.setValue('lines.0', newLine(settings), { shouldDirty: true });
        return;
      }
      remove(i);
      requestAnimationFrame(() => focusField(`lines.${Math.max(0, i - 1)}.description`));
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (to < 0 || to >= fields.length) return;
      const focusedName = (e.target as HTMLElement).id.replace(`f-lines-${i}-`, '');
      move(i, to);
      requestAnimationFrame(() => focusField(`lines.${to}.${focusedName}`));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2" aria-label="Line items">
        {fields.map((f, i) => (
          <li
            key={f.key}
            onKeyDown={onRowKeyDown(i)}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              setDragOver(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null && dragFrom !== i) move(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            className={cn(
              'group rounded-lg border bg-white p-3 transition-colors focus-within:border-navy/40 focus-within:shadow-sm',
              dragOver === i && dragFrom !== i ? 'border-gold' : 'border-line',
              dragFrom === i && 'opacity-50',
            )}
          >
            <LineRow
              i={i}
              form={form}
              locked={locked}
              currency={currency}
              onRemove={() => (fields.length > 1 ? remove(i) : form.setValue('lines.0', newLine(settings), { shouldDirty: true }))}
              dragHandle={
                <span
                  draggable={!locked}
                  onDragStart={(e) => {
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(i));
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  title="Drag to reorder (or Alt+↑/↓)"
                  className={cn('flex cursor-grab items-center text-muted/60 hover:text-muted', locked && 'invisible')}
                  aria-hidden
                >
                  <GripVertical className="size-4" />
                </span>
              }
            />
          </li>
        ))}
      </ol>
      {!locked && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => addLine()}>
            <Plus /> Add line
          </Button>
          <p className="text-xs text-muted">
            <kbd className="kbd">Enter</kbd> new line · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">⌫</kbd> delete ·{' '}
            <kbd className="kbd">Alt</kbd>+<kbd className="kbd">↑↓</kbd> move
          </p>
        </div>
      )}
    </div>
  );
}

function LineRow({
  i,
  form,
  locked,
  currency,
  onRemove,
  dragHandle,
}: {
  i: number;
  form: UseFormReturn<InvoiceForm>;
  locked: boolean;
  currency: string;
  onRemove: () => void;
  dragHandle: React.ReactNode;
}) {
  const { control, register, setValue, formState } = form;
  const errs = formState.errors.lines?.[i];
  const p = (k: string) => `lines.${i}.${k}`;
  const fetchProducts = useRef((q: string) => searchProducts(q)).current;

  const pickProduct = (prod: Product) => {
    setValue(`lines.${i}.description`, prod.description || prod.name, { shouldDirty: true });
    setValue(`lines.${i}.unitPrice`, prod.unitPrice, { shouldDirty: true });
    setValue(`lines.${i}.noVat`, !!prod.noVat, { shouldDirty: true });
    setValue(`lines.${i}.productId`, prod.id, { shouldDirty: true });
    requestAnimationFrame(() => focusField(`lines.${i}.qty`));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {dragHandle}
        <span className="w-5 text-center text-xs font-medium text-muted tabular">{i + 1}</span>
        <Controller
          control={control}
          name={`lines.${i}.description`}
          render={({ field }) => (
            <Autocomplete<Product>
              ref={field.ref}
              id={fieldId(p('description'))}
              data-field={p('description')}
              aria-label={`Line ${i + 1} description`}
              placeholder="Description (type to search saved products)"
              className="flex-1"
              value={field.value}
              readOnly={locked}
              onValueChange={(v) => {
                field.onChange(v);
                setValue(`lines.${i}.productId`, undefined);
              }}
              onBlur={field.onBlur}
              fetchItems={fetchProducts}
              itemKey={(x) => x.id}
              renderItem={(x) => (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{x.name}</span>
                  <span className="shrink-0 text-xs text-muted tabular">{formatAmount(x.unitPrice)}</span>
                </div>
              )}
              onSelectItem={pickProduct}
            />
          )}
        />
        {!locked && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted opacity-60 hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
            onClick={onRemove}
            aria-label={`Delete line ${i + 1}`}
            tabIndex={-1}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pl-7 sm:grid-cols-[64px_minmax(100px,1fr)_64px_84px_minmax(110px,1fr)]">
        <MiniField label="Qty" error={errs?.qty?.message}>
          <Controller
            control={control}
            name={`lines.${i}.qty`}
            render={({ field }) => (
              <DecimalInput
                ref={field.ref}
                id={fieldId(p('qty'))}
                data-field={p('qty')}
                value={field.value}
                onValueChange={field.onChange}
                readOnly={locked}
                className="h-9"
              />
            )}
          />
        </MiniField>
        <MiniField label="Unit price" error={errs?.unitPrice?.message}>
          <Controller
            control={control}
            name={`lines.${i}.unitPrice`}
            render={({ field }) => (
              <DecimalInput
                ref={field.ref}
                id={fieldId(p('unitPrice'))}
                data-field={p('unitPrice')}
                value={field.value}
                onValueChange={field.onChange}
                decimals={2}
                readOnly={locked}
                aria-label={`Unit price (${currency})`}
                className="h-9"
              />
            )}
          />
        </MiniField>
        <MiniField label="Disc. %" error={errs?.discountPct?.message}>
          <Controller
            control={control}
            name={`lines.${i}.discountPct`}
            render={({ field }) => (
              <DecimalInput
                ref={field.ref}
                id={fieldId(p('discountPct'))}
                data-field={p('discountPct')}
                value={field.value}
                onValueChange={field.onChange}
                readOnly={locked}
                placeholder="0"
                className="h-9"
              />
            )}
          />
        </MiniField>
        <label
          className="flex min-w-0 cursor-pointer select-none flex-col gap-1"
          title="Tick for exempt, zero-rated or disbursement items. They are left out of the VAT calculation."
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">VAT</span>
          <span className="flex h-9 items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              id={fieldId(p('noVat'))}
              data-field={p('noVat')}
              disabled={locked}
              className="size-4 accent-navy"
              {...register(`lines.${i}.noVat`)}
            />
            No VAT
          </span>
        </label>
        <LineAmount control={control} i={i} />
      </div>
    </div>
  );
}

function MiniField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {error && (
        <span role="alert" className="text-[11.5px] text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

function LineAmount({ control, i }: { control: Control<InvoiceForm>; i: number }) {
  const line = useWatch({ control, name: `lines.${i}` });
  const t = lineTotals(line);
  return (
    <div className="flex min-w-0 flex-col gap-1 text-right">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Amount excl. VAT</span>
      <div className="flex h-9 flex-col justify-center">
        <span className="text-sm font-semibold text-navy tabular">{formatMoney(t.amountCents / 100, { dashForZero: false })}</span>
        {line.noVat && <span className="text-[11px] text-muted">not subject to VAT</span>}
      </div>
    </div>
  );
}
