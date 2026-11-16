import type { Invoice } from '@/db/types';
import { invoiceTotals, formatAmount, formatQty, formatDiscount, vatRateLabel } from '@/lib/money';
import { amountInWords } from '@/lib/amountInWords';
import { termsLabel } from '@/templates/model';
import { formatDate } from '@/lib/utils';

/**
 * Tags for uploaded Word (.docx) templates. One list drives the Tag reference panel,
 * the sample template, upload checks and filling.
 */
export interface TagDef {
  tag: string;
  label: string;
  example: string;
}

export const DOCUMENT_TAGS: TagDef[] = [
  { tag: 'document_title', label: '"VAT INVOICE" or "CREDIT NOTE"', example: 'VAT INVOICE' },
  { tag: 'invoice_number', label: 'Invoice / credit note number', example: 'PSINV1245' },
  { tag: 'invoice_date', label: 'Invoice date', example: '16 Nov 2026' },
  { tag: 'due_date', label: 'Due date', example: '16 Dec 2026' },
  { tag: 'payment_terms', label: 'Payment terms', example: 'Net 30 days' },
  { tag: 'currency', label: 'Currency code', example: 'MUR' },
  { tag: 'credit_note_for', label: 'Credit notes: the invoice being credited', example: 'PSINV1244' },
  { tag: 'seller_name', label: 'Your company name', example: 'Acme Trading Ltd' },
  { tag: 'seller_address', label: 'Your address', example: '1 Main Street, Port Louis' },
  { tag: 'seller_brn', label: 'Your BRN', example: 'C07012345' },
  { tag: 'seller_vat_no', label: 'Your VAT Reg. No.', example: 'VAT27012345' },
  { tag: 'seller_phone', label: 'Your phone', example: '+230 210 0000' },
  { tag: 'seller_email', label: 'Your email', example: 'accounts@example.com' },
  { tag: 'client_name', label: 'Client name', example: 'ABC Ltd' },
  { tag: 'client_address', label: 'Client address', example: '12 Example Street' },
  { tag: 'client_brn', label: 'Client BRN', example: 'C00000000' },
  { tag: 'client_vat_no', label: 'Client VAT Reg. No.', example: 'VAT00000000' },
  { tag: 'client_attention', label: 'Attention', example: 'Accounts Payable' },
  { tag: 'subtotal', label: 'Subtotal (before discounts)', example: '26,900.00' },
  { tag: 'discount_total', label: 'Total discount', example: '420.00' },
  { tag: 'total_vat_exclusive', label: 'Total VAT exclusive', example: '26,480.00' },
  { tag: 'vat_rate', label: 'VAT rate (number only)', example: '15' },
  { tag: 'vat_label', label: 'VAT label', example: 'VAT @ 15%' },
  { tag: 'vat_total', label: 'VAT amount', example: '3,792.00' },
  { tag: 'not_subject_to_vat', label: 'Amount on "No VAT" lines', example: '1,200.00' },
  { tag: 'total_vat_inclusive', label: 'Total VAT inclusive', example: '30,272.00' },
  { tag: 'amount_paid', label: 'Amount paid', example: '0.00' },
  { tag: 'balance_due', label: 'Balance due', example: '30,272.00' },
  { tag: 'amount_in_words', label: 'Total in words', example: 'Thirty thousand two hundred and seventy-two rupees only' },
  { tag: 'payment_reference', label: 'Payment reference (= number)', example: 'PSINV1245' },
  { tag: 'bank_name', label: 'Bank', example: 'The Mauritius Commercial Bank' },
  { tag: 'bank_account_name', label: 'Account name', example: 'Acme Trading Ltd' },
  { tag: 'bank_account_no', label: 'Account no.', example: '000 123 456 789' },
  { tag: 'bank_iban', label: 'IBAN', example: 'MU17 MCBL …' },
  { tag: 'bank_swift', label: 'SWIFT / BIC', example: 'MCBLMUMU' },
  { tag: 'notes', label: 'Notes & terms', example: 'Payment is due within 30 days…' },
];

/** Inside the {#items}…{/items} loop (put both in the same table row to repeat the row). */
export const ITEM_TAGS: TagDef[] = [
  { tag: 'no', label: 'Line number', example: '1' },
  { tag: 'description', label: 'Description', example: 'Monthly bookkeeping' },
  { tag: 'qty', label: 'Quantity', example: '1' },
  { tag: 'unit_price', label: 'Unit price', example: '15,000.00' },
  { tag: 'discount', label: 'Discount %', example: '10%' },
  { tag: 'amount', label: 'Amount (VAT exclusive)', example: '15,000.00' },
  { tag: 'vat', label: '"No VAT" for exempt lines, otherwise blank', example: '' },
];

export const LOOP_TAG = 'items';

/** Old names from earlier versions → current names (warned about on upload). */
export const RENAMED_TAGS: Record<string, string> = {
  total_due: 'total_vat_inclusive',
  total_excl_vat: 'total_vat_exclusive',
};

/** Tags the recommended template contains; missing ones are pointed out on upload. */
export const RECOMMENDED_TAGS = [
  'invoice_number',
  'invoice_date',
  'client_name',
  'total_vat_exclusive',
  'vat_total',
  'total_vat_inclusive',
  'balance_due',
];

const money = (n: number) => formatAmount(n);

export interface ItemData {
  no: string;
  description: string;
  qty: string;
  unit_price: string;
  discount: string;
  amount: string;
  vat: string;
}

/** The values for every tag, for one invoice or credit note. */
export function buildTagData(inv: Invoice, opts: { creditNoteFor?: string } = {}): Record<string, unknown> {
  const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
  const s = inv.seller;
  const c = inv.client;
  const isCredit = inv.docType === 'credit_note';
  const items: ItemData[] = inv.lines
    .filter((l) => l.description.trim() || l.unitPrice)
    .map((l, i) => ({
      no: String(i + 1),
      description: l.description,
      qty: formatQty(l.qty),
      unit_price: money(l.unitPrice),
      discount: formatDiscount(l.discountPct),
      amount: money(t.lines[inv.lines.indexOf(l)].amountCents / 100),
      vat: l.noVat ? 'No VAT' : '',
    }));
  return {
    document_title: isCredit ? 'CREDIT NOTE' : 'VAT INVOICE',
    invoice_number: inv.number,
    invoice_date: formatDate(inv.issueDate),
    due_date: formatDate(inv.dueDate),
    payment_terms: termsLabel(inv.termsDays),
    currency: inv.currency,
    credit_note_for: opts.creditNoteFor ?? '',
    seller_name: s.name,
    seller_address: s.address,
    seller_brn: s.brn,
    seller_vat_no: s.vatNo,
    seller_phone: s.phone,
    seller_email: s.email,
    client_name: c.name,
    client_address: c.address,
    client_brn: c.brn,
    client_vat_no: c.vatNo,
    client_attention: c.attention,
    subtotal: money(t.subtotal),
    discount_total: money(t.discount),
    total_vat_exclusive: money(t.totalVatExclusive),
    vat_rate: formatQty(t.vatRate),
    vat_label: vatRateLabel(t.vatRate),
    vat_total: money(t.vat),
    not_subject_to_vat: money(t.notSubjectToVat),
    total_vat_inclusive: money(t.totalVatInclusive),
    amount_paid: money(t.amountPaid),
    balance_due: money(t.balanceDue),
    amount_in_words: t.totalVatInclusive ? amountInWords(t.totalVatInclusive, inv.currency) : '',
    payment_reference: inv.number,
    bank_name: s.bank.bankName,
    bank_account_name: s.bank.accountName,
    bank_account_no: s.bank.accountNo,
    bank_iban: s.bank.iban,
    bank_swift: s.bank.swift,
    notes: inv.notes,
    [LOOP_TAG]: items,
  };
}

export const KNOWN_TAGS = new Set(DOCUMENT_TAGS.map((t) => t.tag));
export const KNOWN_ITEM_TAGS = new Set(ITEM_TAGS.map((t) => t.tag));
