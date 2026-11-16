import { describe, expect, it } from 'vitest';
import { formatMoney, formatQty, invoiceTotals, toCents, vatRateLabel } from './money';
import { amountInWords, integerToWords } from './amountInWords';
import type { LineItem } from '@/db/types';

const line = (qty: number, unitPrice: number, discountPct = 0, noVat = false): LineItem => ({
  id: String(Math.random()),
  description: 'x',
  qty,
  unitPrice,
  discountPct,
  noVat,
});

// The four example rows of the original spreadsheet template
const excelLines = (disbursementNoVat: boolean) => [
  line(1, 15000),
  line(1, 6500),
  line(12, 350, 10),
  line(1, 1200, 0, disbursementNoVat),
];

describe('Acceptance 1: disbursement marked "No VAT", rate 15%', () => {
  const t = invoiceTotals(excelLines(true), 15);

  it('totals', () => {
    expect(t.lines.map((l) => l.amountCents / 100)).toEqual([15000, 6500, 3780, 1200]);
    expect(t.subtotal).toBe(26900);
    expect(t.discount).toBe(420);
    expect(t.totalVatExclusive).toBe(26480);
    expect(t.vatable).toBe(25280);
    expect(t.notSubjectToVat).toBe(1200);
    expect(t.vat).toBe(3792);
    expect(t.totalVatInclusive).toBe(30272);
    expect(t.balanceDue).toBe(30272);
  });

  it('formats like the Excel number formats', () => {
    expect(formatMoney(t.totalVatInclusive)).toBe('30,272.00');
    expect(formatMoney(-t.discount)).toBe('(420.00)');
    expect(formatMoney(0)).toBe('-');
    expect(formatQty(12)).toBe('12');
    expect(vatRateLabel(15)).toBe('VAT @ 15%');
  });

  it('total in words', () => {
    expect(amountInWords(t.totalVatInclusive, 'MUR')).toBe('Thirty thousand two hundred and seventy-two rupees only');
  });
});

describe('VAT rate per invoice', () => {
  it('all lines VAT-able at 15%', () => {
    const t = invoiceTotals(excelLines(false), 15);
    expect(t.vat).toBe(3972);
    expect(t.totalVatInclusive).toBe(30452);
    expect(t.notSubjectToVat).toBe(0);
  });

  it('rate changed to 12.5%', () => {
    const t = invoiceTotals(excelLines(true), 12.5);
    expect(t.vat).toBe(3160); // 25,280 × 12.5%
    expect(t.totalVatInclusive).toBe(29640);
    expect(vatRateLabel(12.5)).toBe('VAT @ 12.5%');
  });

  it('rate 0 → no VAT', () => {
    const t = invoiceTotals(excelLines(false), 0);
    expect(t.vat).toBe(0);
    expect(t.totalVatInclusive).toBe(t.totalVatExclusive);
  });

  it('VAT is rounded once on the invoice total, half away from zero', () => {
    // 3 × 0.10 at 15%: 0.30 × 15% = 0.045 → 0.05
    expect(invoiceTotals([line(1, 0.1), line(1, 0.1), line(1, 0.1)], 15).vat).toBe(0.05);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(2.675)).toBe(268);
  });

  it('Total VAT Exclusive + VAT = Total VAT Inclusive to the cent (randomised)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 2000; n++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () =>
        line(Math.round(rnd() * 5000) / 100, Math.round(rnd() * 10_000_000) / 100, Math.floor(rnd() * 4) * 7.5, rnd() < 0.2),
      );
      const rate = [0, 5, 12.5, 15, 17.5, 20][Math.floor(rnd() * 6)];
      const t = invoiceTotals(lines, rate, [{ amount: Math.round(rnd() * 1000) / 100 }]);
      expect(toCents(t.totalVatExclusive) + toCents(t.vat)).toBe(toCents(t.totalVatInclusive));
      expect(toCents(t.vatable) + toCents(t.notSubjectToVat)).toBe(toCents(t.totalVatExclusive));
      expect(toCents(t.subtotal) - toCents(t.discount)).toBe(toCents(t.totalVatExclusive));
      expect(toCents(t.totalVatInclusive) - toCents(t.amountPaid)).toBe(toCents(t.balanceDue));
    }
  });

  it('payments reduce the balance', () => {
    const t = invoiceTotals([line(1, 1000)], 15, [{ amount: 500 }]);
    expect(t.totalVatInclusive).toBe(1150);
    expect(t.balanceDue).toBe(650);
  });
});

describe('words', () => {
  it.each([
    [0, 'zero'],
    [7, 'seven'],
    [21, 'twenty-one'],
    [100, 'one hundred'],
    [105, 'one hundred and five'],
    [1005, 'one thousand and five'],
    [1_250_300, 'one million two hundred and fifty thousand three hundred'],
  ])('%i', (n, w) => expect(integerToWords(n)).toBe(w));

  it('cents and other currencies', () => {
    expect(amountInWords(1.5, 'USD')).toBe('One dollar and fifty cents only');
    expect(amountInWords(250, 'GBP')).toBe('Two hundred and fifty pounds only');
  });
});
