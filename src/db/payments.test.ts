import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completeOnboarding, getSettings } from './settingsRepo';
import { addPayment, issueInvoice, nextAvailableNumber, removePayment, saveDraft, voidInvoice } from './invoiceRepo';
import { newInvoice } from '@/lib/invoiceFactory';
import { displayStatus } from '@/lib/status';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await completeOnboarding({ firstNumber: 'PSINV1245' });
});

async function issued(dueDate = '2099-01-01') {
  const s = await getSettings();
  const seq = s.sequences[0];
  const inv = newInvoice(s, seq, (await nextAvailableNumber(seq)).number);
  inv.client.name = 'ABC Ltd';
  inv.lines[0] = { ...inv.lines[0], description: 'Fees', unitPrice: 1000 }; // 1,150.00 incl. VAT
  inv.dueDate = dueDate;
  return (await issueInvoice(inv)).invoice;
}

describe('payments and status', () => {
  it('partially paid → paid, and removing a payment reverts', async () => {
    const inv = await issued();
    expect(displayStatus(inv)).toBe('issued');
    const a = await addPayment(inv.id, { date: '2026-11-20', amount: 500, method: 'Bank transfer' });
    expect(displayStatus(a)).toBe('partially_paid');
    const b = await addPayment(inv.id, { date: '2026-11-25', amount: 650, method: 'Cash' });
    expect(displayStatus(b)).toBe('paid');
    expect(b.history.filter((h) => h.type === 'paid')).toHaveLength(2);
    const c = await removePayment(inv.id, b.payments[1].id);
    expect(displayStatus(c)).toBe('partially_paid');
  });

  it('overdue when past the due date with a balance', async () => {
    const inv = await issued('2020-01-01');
    expect(displayStatus(inv, '2026-11-16')).toBe('overdue');
  });

  it('drafts and void invoices cannot take payments', async () => {
    const s = await getSettings();
    const d = newInvoice(s, s.sequences[0], 'PSINV9999');
    await saveDraft(d);
    await expect(addPayment(d.id, { date: '2026-11-20', amount: 1, method: 'Cash' })).rejects.toThrow(/Issue the invoice/);
    const inv = await issued();
    await voidInvoice(inv.id, 'error');
    await expect(addPayment(inv.id, { date: '2026-11-20', amount: 1, method: 'Cash' })).rejects.toThrow(/void/);
  });
});
