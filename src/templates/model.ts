import type { Invoice } from '@/db/types';
import { invoiceTotals, type InvoiceTotals, formatDiscount, formatMoney, formatQty, vatRateLabel } from '@/lib/money';
import { amountInWords } from '@/lib/amountInWords';
import { formatDate } from '@/lib/utils';

export interface TextLine {
  text: string;
  field?: string;
}

export interface RowModel {
  index: number;
  no: string;
  description: string;
  qty: string;
  unitPrice: string;
  discount: string;
  /** Amount (VAT exclusive) */
  amount: string;
  noVat: boolean;
}

/** Everything a template needs, already formatted. */
export interface DocModel {
  invoice: Invoice;
  totals: InvoiceTotals;
  title: string;
  isCreditNote: boolean;
  isVoid: boolean;
  isDraft: boolean;
  currency: string;
  number: string;
  issueDate: string;
  dueDate: string;
  terms: string;
  logoUrl: string | null;
  /** Screen preview only: show a 'Your logo' box when no logo is uploaded (never in PDF/print). */
  logoPlaceholder: boolean;
  seller: { name: string; lines: TextLine[]; tagline: string; website: string };
  client: { name: string; lines: TextLine[] };
  bank: TextLine[];
  reference: string;
  notes: string;
  amountInWords: string;
  /** "VAT @ 15%" */
  vatLabel: string;
  /** "Includes 1,200.00 not subject to VAT" (empty when every line is VAT-able) */
  notSubjectToVat: string;
  rows: RowModel[];
  footer: string;
}

export function termsLabel(days: number): string {
  if (!days) return 'Due on receipt';
  return `Net ${days} day${days === 1 ? '' : 's'}`;
}

export function buildDocModel(
  inv: Invoice,
  logoUrl: string | null,
  numberOverride?: string,
  opts: { logoPlaceholder?: boolean } = {},
): DocModel {
  const totals = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
  const s = inv.seller;
  const c = inv.client;
  const number = (numberOverride ?? inv.number).trim();
  const isCreditNote = inv.docType === 'credit_note';

  const addr = (text: string, field: string): TextLine[] =>
    text
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ text: t, field }));

  const contact = [s.phone && `Tel: ${s.phone}`, s.email].filter(Boolean).join('  |  ');
  const sellerLines: TextLine[] = [
    ...addr(s.address, 'seller'),
    ...(s.brn ? [{ text: `BRN: ${s.brn}`, field: 'seller' }] : []),
    ...(s.vatNo ? [{ text: `VAT Reg. No: ${s.vatNo}`, field: 'seller' }] : []),
    ...(contact ? [{ text: contact, field: 'seller' }] : []),
  ];
  const clientLines: TextLine[] = [
    ...addr(c.address, 'client.address'),
    ...(c.brn ? [{ text: `BRN: ${c.brn}`, field: 'client.brn' }] : []),
    ...(c.vatNo ? [{ text: `VAT Reg. No: ${c.vatNo}`, field: 'client.vatNo' }] : []),
    ...(c.attention ? [{ text: `Attn: ${c.attention}`, field: 'client.attention' }] : []),
  ];

  const b = s.bank;
  const bank: TextLine[] = [
    ['Bank', b.bankName],
    ['Account name', b.accountName],
    ['Account no.', b.accountNo],
    ['IBAN', b.iban],
    ['SWIFT / BIC', b.swift],
  ]
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => ({ text: `${k}:   ${v}`, field: 'seller.bank' }));

  const rows: RowModel[] = inv.lines.map((l, i) => {
    const t = totals.lines[i];
    const blank = !l.description.trim() && !l.unitPrice;
    return {
      index: i,
      no: blank ? '' : String(i + 1),
      description: l.description,
      qty: blank ? '' : formatQty(l.qty),
      unitPrice: blank ? '' : formatMoney(l.unitPrice),
      discount: formatDiscount(l.discountPct),
      amount: blank ? '' : formatMoney(t.amountCents / 100),
      noVat: !!l.noVat,
    };
  });

  return {
    invoice: inv,
    totals,
    title: isCreditNote ? 'CREDIT NOTE' : 'VAT INVOICE',
    isCreditNote,
    isVoid: inv.status === 'void',
    isDraft: inv.status === 'draft',
    currency: inv.currency || 'MUR',
    number,
    issueDate: formatDate(inv.issueDate),
    dueDate: formatDate(inv.dueDate),
    terms: termsLabel(inv.termsDays),
    logoUrl,
    logoPlaceholder: !logoUrl && !!opts.logoPlaceholder,
    seller: { name: s.name, lines: sellerLines, tagline: s.tagline, website: s.website },
    client: { name: c.name, lines: clientLines },
    bank,
    reference: number ? `Reference:   ${number}` : '',
    notes: inv.notes,
    amountInWords: totals.totalVatInclusive ? amountInWords(totals.totalVatInclusive, inv.currency || 'MUR') : '',
    vatLabel: vatRateLabel(totals.vatRate),
    notSubjectToVat: totals.notSubjectToVat ? `Includes ${formatMoney(totals.notSubjectToVat)} not subject to VAT` : '',
    rows,
    footer: [s.name, s.tagline?.replace(/\s*\|\s*/g, '  |  '), s.website].filter((x) => x?.trim()).join('   •   '),
  };
}
