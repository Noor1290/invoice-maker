import type { AppSettings, Invoice } from '@/db/types';
import { newInvoice, newLine } from '@/lib/invoiceFactory';
import { formatNext } from '@/lib/numbering';

/** Example data for template previews (the sample rows of the original spreadsheet template). */
export function sampleInvoice(settings: AppSettings, templateId?: string): Invoice {
  const seq = settings.sequences.find((s) => s.id === settings.defaultSequenceId) ?? settings.sequences[0];
  const inv = newInvoice(settings, seq, formatNext(seq));
  inv.templateId = templateId ?? settings.defaults.templateId;
  if (!inv.seller.name.trim()) inv.seller.name = 'Your Company Ltd';
  inv.client = {
    name: 'Example Client Ltd',
    address: '12 Example Street, Port Louis\nMauritius',
    brn: 'C00000000',
    vatNo: 'VAT00000000',
    attention: 'Accounts Payable',
    email: '',
    phone: '',
  };
  inv.lines = [
    newLine(settings, { description: 'Monthly bookkeeping & accounts – October 2026', qty: 1, unitPrice: 15000 }),
    newLine(settings, { description: 'VAT return preparation and filing (Q3)', qty: 1, unitPrice: 6500 }),
    newLine(settings, { description: 'Payroll processing – per employee', qty: 12, unitPrice: 350, discountPct: 10 }),
    newLine(settings, {
      description: 'Government registration fees (disbursement)',
      qty: 1,
      unitPrice: 1200,
      noVat: true,
    }),
  ];
  return inv;
}
