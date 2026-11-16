import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completeOnboarding, getSettings, needsOnboarding, saveSequence } from './settingsRepo';
import {
  checkNumber,
  deleteDraft,
  DuplicateNumberError,
  RetiredNumberError,
  issueInvoice,
  LockedInvoiceError,
  nextAvailableNumber,
  saveDraft,
  voidInvoice,
} from './invoiceRepo';
import { STANDARD_SEQUENCE_ID } from './defaults';
import { newInvoice } from '@/lib/invoiceFactory';
import { formatNext } from '@/lib/numbering';
import type { Invoice } from './types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function draftWithNextNumber(): Promise<Invoice> {
  const settings = await getSettings();
  const seq = settings.sequences.find((s) => s.id === STANDARD_SEQUENCE_ID)!;
  const { number } = await nextAvailableNumber(seq);
  const inv = newInvoice(settings, seq, number);
  inv.client.name = 'ABC Ltd';
  inv.lines[0].description = 'Accounting services';
  inv.lines[0].unitPrice = 1000;
  return inv;
}

describe('Acceptance 2: first run', () => {
  it('empty storage needs onboarding; PSINV1245 starts the sequence', async () => {
    expect(await needsOnboarding()).toBe(true);
    await completeOnboarding({ firstNumber: 'PSINV1245' });
    expect(await needsOnboarding()).toBe(false);

    const used: string[] = [];
    for (let i = 0; i < 3; i++) {
      const inv = await draftWithNextNumber();
      await saveDraft(inv);
      used.push(inv.number);
    }
    expect(used).toEqual(['PSINV1245', 'PSINV1246', 'PSINV1247']);
    const seq = (await getSettings()).sequences.find((s) => s.id === STANDARD_SEQUENCE_ID)!;
    expect(formatNext(seq)).toBe('PSINV1248');
  });

  it('rejects a starting number without digits', async () => {
    await expect(completeOnboarding({ firstNumber: 'ABC' })).rejects.toThrow(/digit/);
  });
});

describe('Acceptance 4: duplicates are blocked', () => {
  beforeEach(async () => {
    await completeOnboarding({ firstNumber: 'PSINV1245' });
  });

  it('blocks saving a draft with an existing number in any case / spacing', async () => {
    const first = await draftWithNextNumber();
    await saveDraft(first);

    const second = await draftWithNextNumber();
    second.number = '  psinv1245 ';
    await expect(saveDraft(second)).rejects.toBeInstanceOf(DuplicateNumberError);
    await expect(saveDraft(second)).rejects.toThrow(/PSINV1245 is already used on the invoice to ABC Ltd dated/);
  });

  it('blocks issuing with an existing number', async () => {
    const first = await draftWithNextNumber();
    await issueInvoice(first);
    const second = await draftWithNextNumber();
    second.number = 'PSINV1245';
    await expect(issueInvoice(second)).rejects.toBeInstanceOf(DuplicateNumberError);
  });

  it('live check reports taken / free / near matches; voided numbers stay taken', async () => {
    const first = await draftWithNextNumber();
    await saveDraft(first);
    await voidInvoice(first.id, 'Raised in error');

    const taken = await checkNumber(' PSINV1245');
    expect(taken.state).toBe('taken');
    expect(taken.conflict?.id).toBe(first.id);

    expect((await checkNumber('PSINV1246')).state).toBe('free');
    const near = await checkNumber('PSINV-1245');
    expect(near.state).toBe('free');
    expect(near.nearMatches.map((i) => i.number)).toEqual(['PSINV1245']);

    // The next available number skips past the voided one.
    const seq = (await getSettings()).sequences.find((s) => s.id === STANDARD_SEQUENCE_ID)!;
    expect((await nextAvailableNumber(seq)).number).toBe('PSINV1246');
  });

  it('the unique index itself rejects duplicates', async () => {
    const first = await draftWithNextNumber();
    await saveDraft(first);
    const raw = { ...(await draftWithNextNumber()), normalizedNumber: 'psinv1245' };
    await expect(db.invoices.add(raw)).rejects.toThrow();
  });

  it('issued invoices are locked', async () => {
    const first = await draftWithNextNumber();
    await issueInvoice(first);
    await expect(saveDraft({ ...first, notes: 'changed' })).rejects.toBeInstanceOf(LockedInvoiceError);
  });

  it('near-match 00012 vs 12 is a warning, not a block', async () => {
    const a = await draftWithNextNumber();
    a.number = '00012';
    await saveDraft(a);
    const check = await checkNumber('12');
    expect(check.state).toBe('free');
    expect(check.nearMatches).toHaveLength(1);
  });
});

describe('Deleting drafts retires their number forever', () => {
  beforeEach(async () => {
    await completeOnboarding({ firstNumber: 'PSINV1245' });
  });

  it('retired numbers are never reused nor offered as next available', async () => {
    const a = await draftWithNextNumber(); // PSINV1245
    await saveDraft(a);
    await deleteDraft(a.id);

    expect(await db.invoices.get(a.id)).toBeUndefined();
    expect((await checkNumber('psinv1245 ')).state).toBe('retired');
    expect((await draftWithNextNumber()).number).toBe('PSINV1246');

    const b = await draftWithNextNumber();
    b.number = 'PSINV1245';
    await expect(saveDraft(b)).rejects.toBeInstanceOf(RetiredNumberError);

    const log = await db.numberingLog.where('type').equals('deleted_draft').toArray();
    expect(log).toHaveLength(1);
    expect(log[0].from).toBe('PSINV1245');
  });

  it('even a lowered counter skips retired numbers', async () => {
    const a = await draftWithNextNumber();
    await saveDraft(a);
    await deleteDraft(a.id);
    const seq = (await getSettings()).sequences.find((s) => s.id === STANDARD_SEQUENCE_ID)!;
    await saveSequence({ ...seq, nextNumber: 1245 });
    expect((await draftWithNextNumber()).number).toBe('PSINV1246');
  });

  it('issued invoices cannot be deleted', async () => {
    const a = await draftWithNextNumber();
    await issueInvoice(a);
    await expect(deleteDraft(a.id)).rejects.toBeInstanceOf(LockedInvoiceError);
  });
});

describe('Acceptance 5: skipping numbers', () => {
  it('jumping from 421 to 500 in settings logs the gap', async () => {
    await completeOnboarding({ firstNumber: '421' });
    await issueInvoice(await draftWithNextNumber()); // uses 421
    const seq = (await getSettings()).sequences.find((s) => s.id === STANDARD_SEQUENCE_ID)!;
    expect(formatNext(seq)).toBe('422');
    await saveSequence({ ...seq, nextNumber: 500 }, 'New financial year');

    const log = await db.numberingLog.where('type').equals('skip').toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ from: '422', to: '499', reason: 'New financial year' });

    const inv = await draftWithNextNumber();
    expect(inv.number).toBe('500');
  });

  it('a one-off higher number on an invoice logs the gap and moves the counter', async () => {
    await completeOnboarding({ firstNumber: '421' });
    const inv = await draftWithNextNumber();
    inv.number = '500';
    const { skipped } = await saveDraft(inv, { skipReason: 'Client requested' });
    expect(skipped?.label).toBe('Numbers 421–499 will be skipped');
    const log = await db.numberingLog.where('type').equals('skip').toArray();
    expect(log[0]).toMatchObject({ from: '421', to: '499', reason: 'Client requested' });
    expect((await draftWithNextNumber()).number).toBe('501');
  });

  it('a one-off number outside the format does not move the counter', async () => {
    await completeOnboarding({ firstNumber: 'PSINV1245' });
    const inv = await draftWithNextNumber();
    inv.number = 'SPECIAL-1';
    await saveDraft(inv);
    expect((await draftWithNextNumber()).number).toBe('PSINV1245');
    expect(await db.numberingLog.where('type').equals('manual').count()).toBe(1);
  });

  it('re-saving a draft does not consume extra numbers', async () => {
    await completeOnboarding({ firstNumber: '00012' });
    const inv = await draftWithNextNumber();
    await saveDraft(inv);
    await saveDraft({ ...inv, notes: 'edited' });
    await saveDraft({ ...inv, notes: 'edited again' });
    expect((await draftWithNextNumber()).number).toBe('00013');
  });
});
