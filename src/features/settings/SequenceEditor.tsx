import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Info, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Callout, Segmented } from '@/components/ui/misc';
import type { NumberSequence } from '@/db/types';
import { saveSequence } from '@/db/settingsRepo';
import { checkNumber, describeInvoiceRef, nextAvailableNumber } from '@/db/invoiceRepo';
import {
  describeSkip,
  formatSequenceNumber,
  NUMBER_TOKENS,
  sequenceFormatWarning,
  sequenceFromExample,
  skipRange,
  upcomingNumbers,
  validateSequenceFormat,
} from '@/lib/numbering';
import { cn } from '@/lib/utils';

interface Props {
  sequence: NumberSequence;
  isNew?: boolean;
  compact?: boolean;
  onDone?: (saved: NumberSequence | null) => void;
}

/**
 * Edit one numbering sequence: mode, format, next number, with a live preview,
 * a skip warning (+ reason) and a check that the next number is still free.
 * Used in Settings and in the popover next to the Invoice No. field.
 */
export function SequenceEditor({ sequence, isNew, compact, onDone }: Props) {
  const [draft, setDraft] = useState<NumberSequence>(sequence);
  const [nextText, setNextText] = useState(String(sequence.nextNumber));
  const [example, setExample] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [taken, setTaken] = useState<{ ref: string; free: string } | null>(null);

  useEffect(() => {
    setDraft(sequence);
    setNextText(String(sequence.nextNumber));
  }, [sequence]);

  const set = <K extends keyof NumberSequence>(k: K, v: NumberSequence[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const parsedNext = /^\d+$/.test(nextText.trim()) ? parseInt(nextText.trim(), 10) : NaN;
  const candidate = { ...draft, nextNumber: Number.isNaN(parsedNext) ? -1 : parsedNext };
  const error = Number.isNaN(parsedNext) ? 'Next number must be a whole number, e.g. 1246.' : validateSequenceFormat(candidate);
  const warning = sequenceFormatWarning(draft);
  const preview = error ? [] : upcomingNumbers(candidate, 3);

  const formatChanged =
    draft.prefix !== sequence.prefix || draft.suffix !== sequence.suffix || draft.minDigits !== sequence.minDigits;
  const skip =
    !isNew && !error && !formatChanged ? skipRange(candidate, sequence.nextNumber, candidate.nextNumber) : null;
  const movedBack = !isNew && !error && !formatChanged && candidate.nextNumber < sequence.nextNumber;
  const dirty = isNew || JSON.stringify(candidate) !== JSON.stringify(sequence);

  // Is the next number already used by a saved invoice?
  useEffect(() => {
    if (error) return setTaken(null);
    let cancelled = false;
    const next = formatSequenceNumber(candidate, candidate.nextNumber);
    void (async () => {
      const check = await checkNumber(next);
      if (cancelled) return;
      if (check.state === 'taken' && check.conflict) {
        const free = await nextAvailableNumber(candidate);
        if (!cancelled) setTaken({ ref: describeInvoiceRef(check.conflict), free: free.number });
      } else setTaken(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [error, draft.prefix, draft.suffix, draft.minDigits, candidate.nextNumber]);

  function applyExample() {
    const fmt = sequenceFromExample(example);
    if (!fmt) return toast.error('That example has no digits to count from.');
    setDraft((d) => ({ ...d, prefix: fmt.prefix, suffix: fmt.suffix, minDigits: fmt.minDigits }));
    setNextText(String(fmt.nextNumber));
    setExample('');
  }

  async function save() {
    if (error) return;
    setSaving(true);
    try {
      await saveSequence(candidate, reason);
      toast.success(
        skip ? `Saved. ${describeSkip(skip)} skipped and recorded in the numbering log.` : 'Numbering saved.',
      );
      setReason('');
      onDone?.(candidate);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const idp = `seq-${draft.id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink">Mode</span>
        <Segmented
          name="Numbering mode"
          value={draft.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'auto', label: 'Continue automatically' },
            { value: 'manual', label: 'Enter manually each time' },
          ]}
          className="self-start"
        />
        <p className="text-[12.5px] text-muted">
          {draft.mode === 'auto'
            ? 'Each new invoice is given the next number. You can still override it on a single invoice.'
            : 'The Invoice No. field starts empty; the next number is offered as a suggestion.'}
        </p>
      </div>

      {!compact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor={`${idp}-name`} label="Sequence name">
            <Input id={`${idp}-name`} value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field htmlFor={`${idp}-type`} label="Used for">
            <NativeSelect
              id={`${idp}-type`}
              value={draft.docType}
              onChange={(e) => set('docType', e.target.value as NumberSequence['docType'])}
            >
              <option value="invoice">Invoices</option>
              <option value="credit_note">Credit notes</option>
            </NativeSelect>
          </Field>
        </div>
      )}

      <div className="rounded-lg border border-line bg-band/60 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field
            htmlFor={`${idp}-example`}
            label="Quick setup: type your next invoice number"
            className="flex-1"
          >
            <Input
              id={`${idp}-example`}
              value={example}
              placeholder="e.g. PSINV1246"
              onChange={(e) => setExample(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyExample();
                }
              }}
            />
          </Field>
          <Button variant="outline" onClick={applyExample} disabled={!example.trim()}>
            <Wand2 /> Apply
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'sm:grid-cols-4')}>
        <Field htmlFor={`${idp}-prefix`} label="Prefix" className={compact ? 'col-span-2' : 'sm:col-span-2'}>
          <Input
            id={`${idp}-prefix`}
            value={draft.prefix}
            onChange={(e) => set('prefix', e.target.value)}
            placeholder="e.g. PSINV or INV-{YYYY}-"
            spellCheck={false}
          />
        </Field>
        <Field htmlFor={`${idp}-next`} label="Next number" error={Number.isNaN(parsedNext) ? error : undefined}>
          <Input
            id={`${idp}-next`}
            inputMode="numeric"
            value={nextText}
            onChange={(e) => setNextText(e.target.value.replace(/[^\d]/g, ''))}
            aria-invalid={Number.isNaN(parsedNext)}
            className="tabular"
          />
        </Field>
        <Field htmlFor={`${idp}-digits`} label="Minimum digits" hint="Zero padding">
          <Input
            id={`${idp}-digits`}
            type="number"
            min={1}
            max={12}
            value={draft.minDigits}
            onChange={(e) => set('minDigits', Math.max(1, Math.min(12, parseInt(e.target.value || '1', 10))))}
          />
        </Field>
        <Field htmlFor={`${idp}-suffix`} label="Suffix" optional className={compact ? 'col-span-2' : 'sm:col-span-2'}>
          <Input id={`${idp}-suffix`} value={draft.suffix} onChange={(e) => set('suffix', e.target.value)} spellCheck={false} />
        </Field>
        <div className={cn('flex flex-col gap-1.5', compact ? 'col-span-2' : 'sm:col-span-2')}>
          <span className="text-[13px] font-medium text-ink">Insert date token into prefix</span>
          <div className="flex flex-wrap gap-2">
            {NUMBER_TOKENS.map((t) => (
              <Button key={t} variant="outline" size="sm" className="font-mono" onClick={() => set('prefix', draft.prefix + t)}>
                {t}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-lg border border-navy/15 bg-navy-50 px-4 py-3" aria-live="polite">
        {preview.length ? (
          <>
            <p className="text-sm text-navy">
              Next invoice: <span className="font-semibold tracking-wide">{preview[0]}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">Then {preview.slice(1).join(', ')}…</p>
          </>
        ) : (
          <p className="text-sm text-danger">{error}</p>
        )}
      </div>

      {taken && (
        <Callout tone="warning" icon={<AlertTriangle />}>
          {preview[0]} is already used on {taken.ref}. New invoices will automatically use the next free number,{' '}
          <strong>{taken.free}</strong>.
        </Callout>
      )}

      {warning && (
        <Callout tone="info" icon={<Info />}>
          {warning}
        </Callout>
      )}

      {skip && (
        <Callout tone="warning" icon={<AlertTriangle />}>
          <p className="font-medium">{skip.label}.</p>
          <p className="mt-0.5">The gap will be recorded in the numbering log. Skipped numbers are never filled in later.</p>
          <div className="mt-3">
            <Field htmlFor={`${idp}-reason`} label="Reason" optional>
              <Input
                id={`${idp}-reason`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. New financial year"
              />
            </Field>
          </div>
        </Callout>
      )}

      {movedBack && (
        <Callout tone="info" icon={<Info />}>
          This moves the counter back. Numbers that are already used will be skipped automatically; no number can be used
          twice.
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!dirty && !isNew && (
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-3.5" /> Up to date
          </span>
        )}
        {onDone && (
          <Button variant="ghost" onClick={() => onDone(null)}>
            Cancel
          </Button>
        )}
        <Button onClick={() => void save()} disabled={!!error || saving || !dirty}>
          {isNew ? 'Create sequence' : 'Save numbering'}
        </Button>
      </div>
    </div>
  );
}
