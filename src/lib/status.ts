import type { DisplayStatus, Invoice } from '@/db/types';
import { invoiceTotals } from './money';
import { todayIso } from './utils';

/** Draft / Issued / Partially paid / Paid / Overdue / Void, derived from payments and the due date. */
export function displayStatus(inv: Invoice, today = todayIso()): DisplayStatus {
  if (inv.status === 'void') return 'void';
  if (inv.status === 'draft') return 'draft';
  const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
  if (t.totalVatInclusive > 0 && t.balanceDue <= 0) return 'paid';
  if (inv.dueDate && inv.dueDate < today && t.balanceDue > 0) return 'overdue';
  if (t.amountPaid > 0) return 'partially_paid';
  return 'issued';
}

export const STATUS_META: Record<DisplayStatus, { label: string; tone: 'neutral' | 'navy' | 'gold' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  issued: { label: 'Issued', tone: 'navy' },
  partially_paid: { label: 'Partially paid', tone: 'gold' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  void: { label: 'Void', tone: 'warning' },
};
