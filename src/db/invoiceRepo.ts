import Dexie from 'dexie';
import { db } from './db';
import { getSettings } from './settingsRepo';
import type { ActivityEntry, Invoice, NumberSequence, RetiredNumber } from './types';
import {
  describeSkip,
  formatSequenceNumber,
  looseKey,
  matchSequenceValue,
  normalizeNumber,
  skipRange,
  type SkipRange,
} from '@/lib/numbering';
import { formatDate, nowIso } from '@/lib/utils';

// ───────────────────────── Errors ─────────────────────────

export function describeInvoiceRef(inv: Invoice): string {
  const kind = inv.docType === 'credit_note' ? 'credit note' : 'invoice';
  const who = inv.client.name?.trim() ? ` to ${inv.client.name.trim()}` : '';
  const when = inv.issueDate ? ` dated ${formatDate(inv.issueDate)}` : '';
  const state = inv.status === 'draft' ? ' (draft)' : inv.status === 'void' ? ' (void)' : '';
  return `the ${kind}${who}${when}${state}`;
}

export class DuplicateNumberError extends Error {
  readonly number: string;
  readonly conflict: Invoice;
  constructor(number: string, conflict: Invoice) {
    super(`${conflict.number} is already used on ${describeInvoiceRef(conflict)}.`);
    this.name = 'DuplicateNumberError';
    this.number = number;
    this.conflict = conflict;
  }
}

export class RetiredNumberError extends Error {
  readonly retired: RetiredNumber;
  constructor(retired: RetiredNumber) {
    super(`${retired.number} belonged to a deleted draft and is retired. Numbers are never reused.`);
    this.name = 'RetiredNumberError';
    this.retired = retired;
  }
}

export class LockedInvoiceError extends Error {
  constructor(inv: Invoice) {
    super(
      `${inv.number} has been ${inv.status === 'void' ? 'voided' : 'issued'} and can no longer be edited. ` +
        'Void it or create a credit note instead.',
    );
    this.name = 'LockedInvoiceError';
  }
}

export class IssueValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`This invoice can't be issued yet: ${issues.join(' ')}`);
    this.name = 'IssueValidationError';
    this.issues = issues;
  }
}

// ───────────────────────── Number checks ─────────────────────────

export interface NumberCheck {
  state: 'empty' | 'free' | 'taken' | 'retired';
  conflict?: Invoice;
  retired?: RetiredNumber;
  /** Similar but not identical numbers (e.g. 00012 vs 12). Warn only. */
  nearMatches: Invoice[];
}

/** Check a number against EVERY saved invoice (drafts and voided ones included). */
export async function checkNumber(number: string, excludeId?: string): Promise<NumberCheck> {
  const norm = normalizeNumber(number);
  if (!norm) return { state: 'empty', nearMatches: [] };
  const conflict = await db.invoices
    .where('normalizedNumber')
    .equals(norm)
    .filter((i) => i.id !== excludeId)
    .first();
  const lk = looseKey(number);
  const nearMatches = lk
    ? (await db.invoices.where('looseKey').equals(lk).toArray()).filter(
        (i) => i.id !== excludeId && i.normalizedNumber !== norm,
      )
    : [];
  if (conflict) return { state: 'taken', conflict, nearMatches };
  const retired = await db.retiredNumbers.get(norm);
  if (retired) return { state: 'retired', retired, nearMatches };
  return { state: 'free', nearMatches };
}

async function isUnavailable(norm: string, excludeId?: string): Promise<boolean> {
  const clash = await db.invoices.where('normalizedNumber').equals(norm).first();
  if (clash && clash.id !== excludeId) return true;
  return (await db.retiredNumbers.get(norm)) !== undefined;
}

/** First number from the sequence's counter onwards that no invoice uses yet. */
export async function nextAvailableNumber(
  seq: NumberSequence,
  date: Date | string = new Date(),
  excludeId?: string,
): Promise<{ number: string; value: number }> {
  let value = seq.nextNumber;
  for (let i = 0; i < 100_000; i++, value++) {
    const number = formatSequenceNumber(seq, value, date);
    if (!(await isUnavailable(normalizeNumber(number), excludeId))) return { number, value };
  }
  throw new Error('Could not find a free invoice number.');
}

/**
 * What saving `number` on an invoice in `seq` would do to the counter, without saving.
 * Used by the editor to show "Numbers 422–499 will be skipped" before committing.
 */
export function previewNumberEffect(seq: NumberSequence, number: string, date: string) {
  const value = matchSequenceValue(seq, number, date);
  if (value === null) return { inSequence: false as const, skip: null };
  return { inSequence: true as const, value, skip: value > seq.nextNumber ? skipRange(seq, seq.nextNumber, value, date) : null };
}

// ───────────────────────── Saving ─────────────────────────

export interface SaveOptions {
  /** Optional reason recorded in the numbering log when this save skips numbers. */
  skipReason?: string;
}

export interface SaveResult {
  invoice: Invoice;
  skipped?: SkipRange;
}

const WRITE_TABLES = ['invoices', 'settings', 'numberingLog', 'retiredNumbers'] as const;

/** Must run inside a rw transaction over invoices, settings and numberingLog. */
async function writeInvoice(input: Invoice, existing: Invoice | undefined, opts: SaveOptions): Promise<SaveResult> {
  const number = input.number.trim();
  const norm = number ? normalizeNumber(number) : undefined;

  // Re-check inside the transaction: the unique index is the last line of defence,
  // this gives a friendly message first.
  if (norm) {
    const clash = await db.invoices.where('normalizedNumber').equals(norm).first();
    if (clash && clash.id !== input.id) throw new DuplicateNumberError(number, clash);
    const retired = await db.retiredNumbers.get(norm);
    if (retired) throw new RetiredNumberError(retired);
  }

  let skipped: SkipRange | undefined;
  const numberChanged = !existing || (existing.normalizedNumber ?? '') !== (norm ?? '');

  if (norm && numberChanged) {
    const settings = await getSettings();
    const seq = settings.sequences.find((s) => s.id === input.sequenceId);
    if (seq) {
      const value = matchSequenceValue(seq, number, input.issueDate);
      if (value !== null && value >= seq.nextNumber) {
        const range = skipRange(seq, seq.nextNumber, value, input.issueDate);
        if (range) {
          skipped = range;
          await db.numberingLog.add({
            at: nowIso(),
            sequenceId: seq.id,
            type: 'skip',
            from: range.first,
            to: range.last,
            reason: opts.skipReason?.trim() || undefined,
            invoiceId: input.id,
            detail: `${describeSkip(range)} skipped by using ${number}`,
          });
        }
        seq.nextNumber = value + 1;
        settings.updatedAt = nowIso();
        await db.settings.put(settings);
      } else {
        await db.numberingLog.add({
          at: nowIso(),
          sequenceId: seq.id,
          type: 'manual',
          to: number,
          invoiceId: input.id,
          reason: opts.skipReason?.trim() || undefined,
          detail:
            value === null
              ? `One-off number ${number} entered manually (outside the "${seq.name}" format)`
              : `Earlier unused number ${number} entered manually`,
        });
      }
    }
    if (existing?.normalizedNumber) {
      await db.numberingLog.add({
        at: nowIso(),
        sequenceId: input.sequenceId,
        type: 'release',
        from: existing.number,
        to: number,
        invoiceId: input.id,
        detail: `Draft renumbered from ${existing.number} to ${number}`,
      });
    }
  }

  const now = nowIso();
  // Merge with what's stored, so entries logged elsewhere (e.g. "downloaded") are never lost.
  const history = mergeHistory(existing?.history ?? [], input.history ?? []);
  if (!existing && !history.some((h) => h.type === 'created')) history.unshift({ at: now, type: 'created' });

  const record: Invoice = {
    ...input,
    number,
    normalizedNumber: norm,
    looseKey: norm ? looseKey(number) : undefined,
    clientId: input.client.clientId,
    history,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
  };
  await db.invoices.put(record);
  return { invoice: record, skipped };
}

function mergeHistory(a: ActivityEntry[], b: ActivityEntry[]): ActivityEntry[] {
  const key = (e: ActivityEntry) => `${e.at}|${e.type}|${e.detail ?? ''}`;
  const seen = new Set(a.map(key));
  return [...a, ...b.filter((e) => !seen.has(key(e)))].sort((x, y) => x.at.localeCompare(y.at));
}

async function inWriteTx<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await db.transaction('rw', WRITE_TABLES.map((t) => db.table(t)), fn);
  } catch (err) {
    // Unique index violation (e.g. another tab saved the same number a moment earlier).
    if (err instanceof Dexie.ConstraintError || (err as Error)?.name === 'ConstraintError') {
      throw new Error('That invoice number has just been used elsewhere. Pick the next available number.');
    }
    throw err;
  }
}

/** Save a draft. Blocks duplicates and refuses to touch issued or voided invoices. */
export async function saveDraft(input: Invoice, opts: SaveOptions = {}): Promise<SaveResult> {
  return inWriteTx(async () => {
    const existing = await db.invoices.get(input.id);
    if (existing && existing.status !== 'draft') throw new LockedInvoiceError(existing);
    return writeInvoice({ ...input, status: 'draft' }, existing, opts);
  });
}

export function issueProblems(inv: Invoice): string[] {
  const issues: string[] = [];
  if (!inv.number.trim()) issues.push('Add an invoice number.');
  if (!inv.issueDate) issues.push('Add an invoice date.');
  if (!inv.client.name.trim()) issues.push('Add the client name.');
  if (!inv.lines.some((l) => l.description.trim() || l.unitPrice)) issues.push('Add at least one line item.');
  return issues;
}

/** Draft → Issued. Locks the number and content. */
export async function issueInvoice(input: Invoice, opts: SaveOptions = {}): Promise<SaveResult> {
  const problems = issueProblems(input);
  if (problems.length) throw new IssueValidationError(problems);
  return inWriteTx(async () => {
    const existing = await db.invoices.get(input.id);
    if (existing && existing.status !== 'draft') throw new LockedInvoiceError(existing);
    const now = nowIso();
    return writeInvoice(
      {
        ...input,
        status: 'issued',
        issuedAt: now,
        history: [...(input.history ?? []), { at: now, type: 'issued', detail: `Issued as ${input.number.trim()}` }],
      },
      existing,
      opts,
    );
  });
}

/** Void keeps the number permanently; it is never reused. */
export async function voidInvoice(id: string, reason: string): Promise<Invoice> {
  return db.transaction('rw', db.invoices, async () => {
    const inv = await db.invoices.get(id);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.status === 'void') return inv;
    const now = nowIso();
    inv.status = 'void';
    inv.voidReason = reason.trim() || undefined;
    inv.history = [...inv.history, { at: now, type: 'voided', detail: reason.trim() || undefined }];
    inv.updatedAt = now;
    await db.invoices.put(inv);
    return inv;
  });
}

/**
 * Delete a DRAFT. Its number (if any) is retired permanently: it is never
 * reused and never offered as "next available". Issued invoices can only be voided.
 */
export async function deleteDraft(id: string): Promise<void> {
  await inWriteTx(async () => {
    const inv = await db.invoices.get(id);
    if (!inv) return;
    if (inv.status !== 'draft') throw new LockedInvoiceError(inv);
    if (inv.normalizedNumber) {
      await db.retiredNumbers.put({
        normalizedNumber: inv.normalizedNumber,
        number: inv.number,
        sequenceId: inv.sequenceId,
        at: nowIso(),
        reason: 'Deleted draft',
        clientName: inv.client.name || undefined,
      });
      await db.numberingLog.add({
        at: nowIso(),
        sequenceId: inv.sequenceId,
        type: 'deleted_draft',
        from: inv.number,
        invoiceId: inv.id,
        detail: `Draft ${inv.number}${inv.client.name ? ` (${inv.client.name})` : ''} deleted; ${inv.number} is retired and will never be reused`,
      });
    }
    await db.invoices.delete(id);
  });
}

/** Append to the activity history without touching the locked content (downloads, prints…). */
export async function logActivity(id: string, entry: Omit<ActivityEntry, 'at'>): Promise<void> {
  await db.invoices
    .where('id')
    .equals(id)
    .modify((inv) => {
      inv.history = [...inv.history, { ...entry, at: nowIso() }];
    });
}

// ───────────────────────── Payments ─────────────────────────

export interface PaymentInput {
  date: string;
  amount: number;
  method: string;
  reference?: string;
}

/** Record a payment on an issued invoice. Status (Partially paid / Paid / Overdue) is derived from payments. */
export async function addPayment(invoiceId: string, p: PaymentInput): Promise<Invoice> {
  if (!(p.amount > 0)) throw new Error('Enter an amount greater than zero.');
  if (!p.date) throw new Error('Enter the payment date.');
  return db.transaction('rw', db.invoices, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv) throw new Error('Invoice not found.');
    if (inv.status !== 'issued') throw new Error(inv.status === 'void' ? 'A void invoice cannot receive payments.' : 'Issue the invoice before recording payments.');
    const now = nowIso();
    const payment = { id: crypto.randomUUID(), date: p.date, amount: Math.round(p.amount * 100) / 100, method: p.method, reference: p.reference?.trim() ?? '' };
    inv.payments = [...inv.payments, payment];
    inv.history = [
      ...inv.history,
      { at: now, type: 'paid', detail: `${inv.currency} ${payment.amount.toFixed(2)} by ${payment.method}${payment.reference ? ` (${payment.reference})` : ''} on ${formatDate(payment.date)}` },
    ];
    inv.updatedAt = now;
    await db.invoices.put(inv);
    return inv;
  });
}

export async function removePayment(invoiceId: string, paymentId: string): Promise<Invoice> {
  return db.transaction('rw', db.invoices, async () => {
    const inv = await db.invoices.get(invoiceId);
    if (!inv) throw new Error('Invoice not found.');
    const p = inv.payments.find((x) => x.id === paymentId);
    if (!p) return inv;
    const now = nowIso();
    inv.payments = inv.payments.filter((x) => x.id !== paymentId);
    inv.history = [...inv.history, { at: now, type: 'payment_removed', detail: `${inv.currency} ${p.amount.toFixed(2)} on ${formatDate(p.date)} removed` }];
    inv.updatedAt = now;
    await db.invoices.put(inv);
    return inv;
  });
}

export function sequenceForDoc(seqs: NumberSequence[], docType: Invoice['docType']): NumberSequence | undefined {
  return seqs.find((s) => s.docType === docType);
}
