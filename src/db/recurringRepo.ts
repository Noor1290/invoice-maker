import { db } from './db';
import { getSettings } from './settingsRepo';
import { nextAvailableNumber, saveDraft } from './invoiceRepo';
import type { Invoice, LineItem, RecurringInterval, RecurringRule } from './types';
import { newInvoice } from '@/lib/invoiceFactory';
import { applyPlaceholders, dueDates, isFinished, nextOccurrence, occurrence } from '@/lib/recurrence';
import { addDays, formatDate, nowIso, todayIso, uid } from '@/lib/utils';

export interface RecurringSetup {
  name: string;
  interval: RecurringInterval;
  startDate: string;
  endDate?: string;
  maxCount?: number;
  lines: LineItem[];
  notes: string;
}

function validate(s: RecurringSetup) {
  if (!s.startDate) throw new Error('Choose the date of the first invoice.');
  if (s.endDate && s.endDate < s.startDate) throw new Error('The end date is before the first invoice.');
  if (s.maxCount !== undefined && !(Number.isInteger(s.maxCount) && s.maxCount >= 1)) throw new Error('Enter how many invoices to create (1 or more).');
  if (!s.lines.some((l) => l.description.trim() || l.unitPrice)) throw new Error('Keep at least one line item.');
}

/** Set up "repeat this invoice" from an issued invoice. Nothing is created until a date is due. */
export async function createRecurringFromInvoice(inv: Invoice, s: RecurringSetup): Promise<RecurringRule> {
  if (inv.status !== 'issued' || inv.docType !== 'invoice') throw new Error('Only issued invoices can be repeated.');
  validate(s);
  const now = nowIso();
  const rule: RecurringRule = {
    id: uid(),
    name: s.name.trim() || `${inv.client.name || 'Invoice'} (${s.interval})`,
    sourceInvoiceId: inv.id,
    sourceNumber: inv.number,
    interval: s.interval,
    startDate: s.startDate,
    nextRunDate: s.startDate,
    endDate: s.endDate || undefined,
    maxCount: s.maxCount,
    createdCount: 0,
    status: 'active',
    content: {
      sequenceId: inv.sequenceId,
      client: { ...inv.client },
      lines: s.lines.map((l) => ({ ...l, id: uid() })),
      notes: s.notes,
      currency: inv.currency,
      vatRate: inv.vatRate,
      termsDays: inv.termsDays,
      templateId: inv.templateId,
    },
    generated: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.recurring.add(rule);
  return rule;
}

/** Edit a schedule. Dates already created are never created again. */
export async function updateRecurring(id: string, s: RecurringSetup): Promise<RecurringRule> {
  validate(s);
  return db.transaction('rw', db.recurring, async () => {
    const r = await db.recurring.get(id);
    if (!r) throw new Error('Schedule not found.');
    const lastDone = r.generated.map((g) => g.date).sort().at(-1);
    const next = { ...r, name: s.name.trim() || r.name, interval: s.interval, startDate: s.startDate, endDate: s.endDate || undefined, maxCount: s.maxCount };
    // The first occurrence of the (possibly new) schedule after the last created invoice.
    let n = 0;
    let date = occurrence(next.startDate, next.interval, 0);
    while (lastDone && date <= lastDone && n < 1200) date = occurrence(next.startDate, next.interval, ++n);
    next.nextRunDate = date;
    next.content = { ...r.content, lines: s.lines.map((l) => ({ ...l })), notes: s.notes };
    if (next.status === 'finished' && !isFinished(next)) next.status = 'active';
    if (next.status === 'active' && isFinished(next)) next.status = 'finished';
    next.updatedAt = nowIso();
    await db.recurring.put(next);
    return next;
  });
}

export async function setRecurringStatus(id: string, status: 'active' | 'paused' | 'stopped') {
  await db.recurring.update(id, { status, updatedAt: nowIso() });
}

/**
 * Create every due invoice as a DRAFT (never issued): one per missed date, each with its
 * own date, the next number in the sequence and {month} {year} filled in.
 * Runs per schedule inside one transaction, so two open tabs can never create duplicates.
 */
export async function generateDueRecurring(today = todayIso()): Promise<Invoice[]> {
  const created: Invoice[] = [];
  const ids = (await db.recurring.where('status').equals('active').toArray()).map((r) => r.id);
  for (const id of ids) {
    await db.transaction('rw', [db.recurring, db.invoices, db.settings, db.numberingLog, db.retiredNumbers], async () => {
      const r = await db.recurring.get(id);
      if (!r || r.status !== 'active') return;
      for (const date of dueDates(r, today)) {
        const existing = await db.invoices
          .where('recurringRuleId')
          .equals(r.id)
          .filter((i) => i.recurringDate === date)
          .first();
        if (existing) {
          r.generated.push({ date, invoiceId: existing.id, number: existing.number });
        } else {
          const settings = await getSettings();
          const seq = settings.sequences.find((s) => s.id === r.content.sequenceId) ?? settings.sequences.find((s) => s.id === settings.defaultSequenceId)!;
          const { number } = await nextAvailableNumber(seq, date);
          const base = newInvoice(settings, seq, number);
          const c = r.content;
          const inv: Invoice = {
            ...base,
            issueDate: date,
            dueDate: addDays(date, c.termsDays),
            termsDays: c.termsDays,
            currency: c.currency,
            vatRate: c.vatRate,
            templateId: c.templateId,
            client: { ...c.client },
            lines: c.lines.map((l) => ({ ...l, id: uid(), description: applyPlaceholders(l.description, date) })),
            notes: applyPlaceholders(c.notes, date),
            recurringRuleId: r.id,
            recurringDate: date,
            history: [{ at: nowIso(), type: 'created', detail: `Created by the recurring schedule “${r.name}” for ${formatDate(date)}` }],
          };
          const res = await saveDraft(inv);
          created.push(res.invoice);
          r.generated.push({ date, invoiceId: res.invoice.id, number: res.invoice.number });
        }
        r.createdCount++;
        r.nextRunDate = nextOccurrence(r, date);
      }
      if (isFinished(r)) r.status = 'finished';
      r.updatedAt = nowIso();
      await db.recurring.put(r);
    });
  }
  return created;
}

/** Drafts created by schedules that are waiting to be reviewed and issued. */
export async function recurringDraftsToReview(): Promise<Invoice[]> {
  const list = await db.invoices.where('status').equals('draft').filter((i) => !!i.recurringRuleId).toArray();
  return list.sort((a, b) => (a.issueDate + a.number).localeCompare(b.issueDate + b.number));
}
