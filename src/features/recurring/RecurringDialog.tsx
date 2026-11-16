import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Field } from '@/components/ui/field';
import { Callout, Segmented } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Invoice, LineItem, RecurringInterval, RecurringRule } from '@/db/types';
import { createRecurringFromInvoice, generateDueRecurring, updateRecurring } from '@/db/recurringRepo';
import { applyPlaceholders, occurrence, suggestPlaceholders } from '@/lib/recurrence';
import { formatAmount } from '@/lib/money';
import { formatDate, todayIso } from '@/lib/utils';

type EndMode = 'never' | 'date' | 'count';

interface Props {
  /** Set up from this issued invoice … */
  invoice?: Invoice;
  /** … or edit this schedule. */
  rule?: RecurringRule;
  onClose: (saved?: RecurringRule) => void;
}

const INTERVALS: { value: RecurringInterval; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export function RecurringDialog({ invoice, rule, onClose }: Props) {
  const isEdit = !!rule;
  const src = rule
    ? { client: rule.content.client, lines: rule.content.lines, notes: rule.content.notes, currency: rule.content.currency, date: rule.startDate }
    : { client: invoice!.client, lines: invoice!.lines, notes: invoice!.notes, currency: invoice!.currency, date: invoice!.issueDate };

  const [interval, setInterval] = useState<RecurringInterval>(rule?.interval ?? 'monthly');
  const [startDate, setStartDate] = useState(rule?.startDate ?? occurrence(invoice!.issueDate, 'monthly', 1));
  const [startTouched, setStartTouched] = useState(isEdit);
  const [name, setName] = useState(rule?.name ?? `${invoice!.client.name || 'Client'} retainer`);
  const [endMode, setEndMode] = useState<EndMode>(rule?.maxCount ? 'count' : rule?.endDate ? 'date' : 'never');
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [maxCount, setMaxCount] = useState(rule?.maxCount ?? 12);
  const [lines, setLines] = useState<LineItem[]>(() =>
    src.lines
      .filter((l) => l.description.trim() || l.unitPrice)
      .map((l) => ({ ...l, description: isEdit ? l.description : suggestPlaceholders(l.description, src.date) })),
  );
  const [notes, setNotes] = useState(isEdit ? src.notes : suggestPlaceholders(src.notes, src.date));
  const [busy, setBusy] = useState(false);

  const firstDates = useMemo(() => [0, 1, 2].map((n) => occurrence(startDate || todayIso(), interval, n)), [startDate, interval]);
  const pastDue = startDate && startDate <= todayIso();

  const save = async () => {
    setBusy(true);
    try {
      const setup = {
        name,
        interval,
        startDate,
        endDate: endMode === 'date' ? endDate : undefined,
        maxCount: endMode === 'count' ? maxCount : undefined,
        lines,
        notes,
      };
      const saved = isEdit ? await updateRecurring(rule!.id, setup) : await createRecurringFromInvoice(invoice!, setup);
      const created = await generateDueRecurring();
      toast.success(
        isEdit
          ? 'Schedule updated. Future invoices use the changes.'
          : created.length
            ? `Schedule saved. ${created.length} draft${created.length === 1 ? ' is' : 's are'} ready to review.`
            : `Schedule saved. The first draft will be created on ${formatDate(startDate)}.`,
      );
      onClose(saved);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Repeat className="size-5 text-gold-700" /> {isEdit ? 'Edit recurring schedule' : 'Repeat this invoice'}
          </DialogTitle>
          <DialogDescription>
            New invoices are created as <strong>drafts</strong> on each date, with the next number. You review and issue them;
            nothing is issued automatically.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="r-name" label="Schedule name">
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink">Repeat</span>
              <Segmented
                name="Repeat"
                value={interval}
                onChange={(v) => {
                  setInterval(v);
                  if (!startTouched && invoice) setStartDate(occurrence(invoice.issueDate, v, 1));
                }}
                options={INTERVALS}
                className="self-start"
              />
            </div>
            <Field htmlFor="r-start" label="First invoice date" hint={`Then ${firstDates.slice(1).map(formatDate).join(', ')}…`}>
              <Input
                id="r-start"
                type="date"
                value={startDate}
                required
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setStartTouched(true);
                }}
              />
            </Field>
            <Field htmlFor="r-end" label="Ends">
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect id="r-end" value={endMode} onChange={(e) => setEndMode(e.target.value as EndMode)} className="w-40">
                  <option value="never">Never</option>
                  <option value="date">On a date</option>
                  <option value="count">After a number of times</option>
                </NativeSelect>
                {endMode === 'date' && <Input type="date" aria-label="End date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" required />}
                {endMode === 'count' && (
                  <span className="inline-flex items-center gap-2 text-sm">
                    <Input
                      type="number"
                      aria-label="Number of invoices"
                      min={1}
                      max={600}
                      value={maxCount}
                      onChange={(e) => setMaxCount(Math.max(1, parseInt(e.target.value || '1', 10)))}
                      className="w-20"
                    />
                    invoices
                  </span>
                )}
              </div>
            </Field>
          </div>

          {pastDue && !isEdit && (
            <Callout tone="info">
              The first date is today or in the past: the draft{firstDates.filter((d) => d <= todayIso()).length > 1 ? 's' : ''} for
              every date up to today will be created as soon as you save.
            </Callout>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">Line items</span>
              <span className="text-xs text-muted">
                Use <code>{'{month}'}</code> <code>{'{year}'}</code> <code>{'{month_short}'}</code> <code>{'{quarter}'}</code>: filled in from each invoice's date
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {lines.map((l, i) => (
                <li key={l.id} className="grid grid-cols-[1fr_96px] gap-2 rounded-lg border border-line p-2.5 sm:grid-cols-[1fr_64px_110px]">
                  <div className="min-w-0">
                    <Input
                      aria-label={`Line ${i + 1} description`}
                      value={l.description}
                      onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))}
                    />
                    <p className="mt-1 truncate text-xs text-muted">e.g. {applyPlaceholders(l.description, firstDates[0])}</p>
                  </div>
                  <DecimalInput
                    aria-label={`Line ${i + 1} quantity`}
                    value={l.qty}
                    onValueChange={(qty) => setLines(lines.map((x, k) => (k === i ? { ...x, qty } : x)))}
                    className="max-sm:hidden"
                  />
                  <DecimalInput
                    aria-label={`Line ${i + 1} unit price (${src.currency})`}
                    value={l.unitPrice}
                    decimals={2}
                    onValueChange={(unitPrice) => setLines(lines.map((x, k) => (k === i ? { ...x, unitPrice } : x)))}
                  />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              Client: <strong className="text-ink">{src.client.name}</strong> · {src.currency} · prices excl. VAT, e.g.{' '}
              {formatAmount(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))} per invoice
            </p>
          </div>

          <Field htmlFor="r-notes" label="Notes & terms">
            <Textarea id="r-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !startDate}>
              <Repeat /> {isEdit ? 'Save schedule' : 'Start repeating'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
