import type { Invoice } from '@/db/types';
import { csvCell } from '@/db/backup';
import { invoiceTotals } from './money';
import { displayStatus, STATUS_META } from './status';

/** One row per invoice; UTF-8 with BOM so Excel opens it with the right characters. */
export function invoicesCsv(invoices: Invoice[]): string {
  const header = [
    'Type',
    'Number',
    'Invoice date',
    'Due date',
    'Status',
    'Client',
    'Client VAT no.',
    'Currency',
    'Total VAT exclusive',
    'VAT rate %',
    'VAT',
    'Total VAT inclusive',
    'Amount paid',
    'Balance due',
  ];
  const rows = [...invoices]
    .sort((a, b) => (a.issueDate + a.number).localeCompare(b.issueDate + b.number))
    .map((inv) => {
      const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
      return [
        inv.docType === 'credit_note' ? 'Credit note' : 'Invoice',
        inv.number,
        inv.issueDate,
        inv.dueDate,
        STATUS_META[displayStatus(inv)].label,
        inv.client.name,
        inv.client.vatNo,
        inv.currency,
        t.totalVatExclusive.toFixed(2),
        t.vatRate,
        t.vat.toFixed(2),
        t.totalVatInclusive.toFixed(2),
        t.amountPaid.toFixed(2),
        t.balanceDue.toFixed(2),
      ];
    });
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
