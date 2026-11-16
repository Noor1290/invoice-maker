import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completeOnboarding, getSettings } from './settingsRepo';
import { issueInvoice, nextAvailableNumber, saveDraft } from './invoiceRepo';
import { createRecurringFromInvoice, generateDueRecurring, recurringDraftsToReview, setRecurringStatus, updateRecurring, type RecurringSetup } from './recurringRepo';
import { newInvoice, newLine } from '@/lib/invoiceFactory';
import type { Invoice } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await completeOnboarding({ firstNumber: 'PSINV1245' });
});

async function issuedRetainer(): Promise<Invoice> {
  const s = await getSettings();
  const seq = s.sequences[0];
  const inv = newInvoice(s, seq, (await nextAvailableNumber(seq)).number);
  inv.issueDate = '2026-07-01';
  inv.client.name = 'ABC Ltd';
  inv.lines = [newLine(undefined, { description: 'Bookkeeping – July 2026', unitPrice: 15000 })];
  inv.notes = 'Fees for {month} {year}.';
  return (await issueInvoice(inv)).invoice; // PSINV1245
}

const setup = (inv: Invoice, o: Partial<RecurringSetup> = {}): RecurringSetup => ({
  name: 'ABC retainer',
  interval: 'monthly',
  startDate: '2026-08-01',
  lines: inv.lines.map((l) => ({ ...l, description: 'Bookkeeping – {month} {year}' })),
  notes: inv.notes,
  ...o,
});

describe('recurring invoices', () => {
  it('creates every missed invoice as a draft, with its own date, next number and month', async () => {
    const inv = await issuedRetainer();
    await createRecurringFromInvoice(inv, setup(inv));
    const created = await generateDueRecurring('2026-11-16');

    expect(created.map((i) => [i.issueDate, i.number, i.status, i.lines[0].description])).toEqual([
      ['2026-08-01', 'PSINV1246', 'draft', 'Bookkeeping – August 2026'],
      ['2026-09-01', 'PSINV1247', 'draft', 'Bookkeeping – September 2026'],
      ['2026-10-01', 'PSINV1248', 'draft', 'Bookkeeping – October 2026'],
      ['2026-11-01', 'PSINV1249', 'draft', 'Bookkeeping – November 2026'],
    ]);
    expect(created[3].notes).toBe('Fees for November 2026.');
    expect(created[3].dueDate).toBe('2026-12-01');
    expect(created[0].client.name).toBe('ABC Ltd');
    const rule = (await db.recurring.toArray())[0];
    expect(rule.nextRunDate).toBe('2026-12-01');
    expect(rule.createdCount).toBe(4);
    expect((await recurringDraftsToReview()).length).toBe(4);
  });

  it('never creates duplicates (run again, or two tabs at once)', async () => {
    const inv = await issuedRetainer();
    await createRecurringFromInvoice(inv, setup(inv));
    await Promise.all([generateDueRecurring('2026-11-16'), generateDueRecurring('2026-11-16')]);
    expect(await generateDueRecurring('2026-11-16')).toEqual([]);
    expect(await db.invoices.where('recurringRuleId').notEqual('').count()).toBe(4);
    // next month: only December is added
    const dec = await generateDueRecurring('2026-12-01');
    expect(dec.map((i) => i.issueDate)).toEqual(['2026-12-01']);
  });

  it('stops after the number of times, and after the end date', async () => {
    const inv = await issuedRetainer();
    await createRecurringFromInvoice(inv, setup(inv, { maxCount: 2 }));
    await createRecurringFromInvoice(inv, setup(inv, { name: 'quarterly', interval: 'quarterly', endDate: '2026-12-31' }));
    const created = await generateDueRecurring('2027-06-30');
    const rules = await db.recurring.toArray();
    expect(created.length).toBe(2 + 2); // monthly ×2, quarterly Aug + Nov
    expect(rules.every((r) => r.status === 'finished')).toBe(true);
  });

  it('paused schedules create nothing; resuming catches up', async () => {
    const inv = await issuedRetainer();
    const rule = await createRecurringFromInvoice(inv, setup(inv));
    await setRecurringStatus(rule.id, 'paused');
    expect(await generateDueRecurring('2026-09-15')).toEqual([]);
    await setRecurringStatus(rule.id, 'active');
    expect((await generateDueRecurring('2026-09-15')).length).toBe(2);
    await setRecurringStatus(rule.id, 'stopped');
    expect(await generateDueRecurring('2027-01-15')).toEqual([]);
  });

  it('editing a schedule changes future invoices only', async () => {
    const inv = await issuedRetainer();
    const rule = await createRecurringFromInvoice(inv, setup(inv));
    await generateDueRecurring('2026-08-15'); // August created
    await updateRecurring(rule.id, { ...setup(inv), lines: [newLine(undefined, { description: 'Accounts – {month_short} {year}', unitPrice: 16000 })] });
    const next = await generateDueRecurring('2026-09-15');
    expect(next.map((i) => [i.issueDate, i.lines[0].description, i.lines[0].unitPrice])).toEqual([['2026-09-01', 'Accounts – Sep 2026', 16000]]);
  });

  it('only issued invoices can be repeated; drafts are never issued automatically', async () => {
    const s = await getSettings();
    const draft = newInvoice(s, s.sequences[0], 'PSINV9999');
    await saveDraft(draft);
    await expect(createRecurringFromInvoice(draft, setup(draft))).rejects.toThrow(/issued/);
    const inv = await issuedRetainer();
    await createRecurringFromInvoice(inv, setup(inv));
    await generateDueRecurring('2026-11-16');
    expect(await db.invoices.where('status').equals('issued').count()).toBe(1); // only the original
  });
});
