import type { LineItem, Payment } from '@/db/types';

/**
 * Totals engine: one VAT rate per invoice.
 *
 *   Line amount (VAT exclusive)  = qty × unit price × (1 − disc%)        (rounded to cents)
 *   Subtotal                     = Σ qty × unit price                    (before discounts)
 *   Discount                     = Subtotal − Total VAT Exclusive
 *   Total VAT Exclusive          = Σ line amounts
 *   VAT @ rate                   = ROUND(Σ amounts of VAT-able lines × rate, 2)
 *   Total VAT Inclusive          = Total VAT Exclusive + VAT
 *   Balance due                  = Total VAT Inclusive − amount paid
 *
 * Lines ticked "No VAT" (exempt, zero-rated, disbursements) are left out of the VAT base.
 * Everything is computed in integer cents, so Exclusive + VAT = Inclusive to the cent.
 */

/** Round a major-unit amount to integer cents, half away from zero (like Excel's ROUND). */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const scaled = Number((amount * 100).toPrecision(15));
  return Math.sign(scaled) * Math.round(Math.abs(scaled));
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export interface LineTotals {
  grossCents: number; // qty × price
  amountCents: number; // VAT exclusive, after discount
}

export function lineTotals(line: Pick<LineItem, 'qty' | 'unitPrice' | 'discountPct'>): LineTotals {
  const qty = Number(line.qty) || 0;
  const price = Number(line.unitPrice) || 0;
  const disc = Math.min(100, Math.max(0, Number(line.discountPct) || 0));
  return {
    grossCents: toCents(qty * price),
    amountCents: toCents(qty * price * (1 - disc / 100)),
  };
}

export function normalizeRate(rate: unknown): number {
  const r = Number(rate);
  return Number.isFinite(r) && r > 0 ? Math.min(r, 100) : 0;
}

export interface InvoiceTotals {
  lines: LineTotals[];
  vatRate: number;
  subtotal: number;
  /** Positive number, shown as (420.00). */
  discount: number;
  totalVatExclusive: number;
  /** Part of Total VAT Exclusive that VAT is charged on. */
  vatable: number;
  /** Part of Total VAT Exclusive on "No VAT" lines. */
  notSubjectToVat: number;
  vat: number;
  totalVatInclusive: number;
  amountPaid: number;
  balanceDue: number;
}

export function invoiceTotals(
  lines: Pick<LineItem, 'qty' | 'unitPrice' | 'discountPct' | 'noVat'>[],
  vatRate: number,
  payments: Pick<Payment, 'amount'>[] = [],
): InvoiceTotals {
  const rate = normalizeRate(vatRate);
  const lt = lines.map(lineTotals);
  let gross = 0;
  let amount = 0;
  let vatable = 0;
  lt.forEach((l, i) => {
    gross += l.grossCents;
    amount += l.amountCents;
    if (!lines[i].noVat) vatable += l.amountCents;
  });
  // ROUND(vatable × rate, 2), computed on integer cents.
  const vat = toCents((vatable * rate) / 100 / 100);
  const paid = payments.reduce((s, p) => s + toCents(Number(p.amount) || 0), 0);
  const inclusive = amount + vat;
  return {
    lines: lt,
    vatRate: rate,
    subtotal: fromCents(gross),
    discount: fromCents(gross - amount),
    totalVatExclusive: fromCents(amount),
    vatable: fromCents(vatable),
    notSubjectToVat: fromCents(amount - vatable),
    vat: fromCents(vat),
    totalVatInclusive: fromCents(inclusive),
    amountPaid: fromCents(paid),
    balanceDue: fromCents(inclusive - paid),
  };
}

// ───────────────────────── Formatting (Excel number formats) ─────────────────────────

const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

/** "#,##0.00;(#,##0.00);"-"" */
export function formatMoney(n: number, opts: { dashForZero?: boolean } = {}): string {
  const { dashForZero = true } = opts;
  const cents = toCents(n);
  if (cents === 0) return dashForZero ? '-' : '0.00';
  const s = fmt2.format(Math.abs(cents) / 100);
  return cents < 0 ? `(${s})` : s;
}

/** Plain "30,272.00" (no brackets/dash), for inputs and summaries. */
export function formatAmount(n: number): string {
  return fmt2.format(toCents(n) / 100);
}

/** "#,##0.##": 1 → "1", 1.5 → "1.5" */
export function formatQty(n: number): string {
  return fmtQty.format(Number(n) || 0);
}

/** Discount %: blank when zero */
export function formatDiscount(n: number): string {
  return n ? `${fmtQty.format(n)}%` : '';
}

/** "VAT @ 15%", "VAT @ 12.5%" */
export function vatRateLabel(rate: number): string {
  return `VAT @ ${fmtQty.format(normalizeRate(rate))}%`;
}
