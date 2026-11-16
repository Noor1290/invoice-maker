import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
  type ParagraphChild,
} from 'docx';
import type { Invoice } from '@/db/types';
import { buildDocModel, type DocModel } from '@/templates/model';
import { paletteFor, type Palette } from '@/templates/theme';
import { formatMoney } from '@/lib/money';

/**
 * Editable Word version of the built-in templates (Classic, Minimal, Compact).
 * Same document model as the preview/PDF: same wording, totals, colours and order.
 * Word lays the text out itself, so line breaks can differ slightly from the PDF.
 */

export interface LogoImage {
  data: Uint8Array;
  width: number; // px
  height: number; // px
}

interface Variant {
  body: number; // pt
  small: number;
  head: number;
  title: number;
  fills: boolean; // shaded header row / totals bar / footer bar
  banded: boolean;
  topBar: boolean;
}

const VARIANTS: Record<string, Variant> = {
  classic: { body: 8.5, small: 7.5, head: 7.5, title: 22, fills: true, banded: true, topBar: true },
  minimal: { body: 8.5, small: 7.5, head: 7, title: 20, fills: false, banded: false, topBar: false },
  compact: { body: 7.5, small: 6.5, head: 6.5, title: 15, fills: true, banded: true, topBar: true },
};

const PAGE_W = 11906; // A4 in twips
const MARGIN_X = 620;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const ARIAL = 'Arial';
const GEORGIA = 'Georgia';
const hex = (c: string) => c.replace('#', '').toUpperCase();

const NONE: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const line = (color: string, eighths = 4): IBorderOptions => ({ style: BorderStyle.SINGLE, size: eighths, color: hex(color) });

function run(text: string, o: { size: number; bold?: boolean; italic?: boolean; color?: string; font?: string; allCaps?: boolean }) {
  return new TextRun({
    text,
    size: Math.round(o.size * 2),
    bold: o.bold,
    italics: o.italic,
    color: o.color ? hex(o.color) : undefined,
    font: o.font ?? ARIAL,
    allCaps: o.allCaps,
  });
}

function para(children: ParagraphChild[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; border?: IBorderOptions } = {}) {
  return new Paragraph({
    children,
    alignment: o.align,
    spacing: { after: o.after ?? 0, before: o.before ?? 0, line: 252 },
    border: o.border ? { bottom: o.border } : undefined,
  });
}

/** Multi-line text → one paragraph per line. */
function lines(text: string, style: Parameters<typeof run>[1], align?: (typeof AlignmentType)[keyof typeof AlignmentType]) {
  return text
    .split('\n')
    .filter((l, _i, a) => l.trim() || a.length === 1)
    .map((l) => para([run(l, style)], { align, after: 20 }));
}

function cell(children: (Paragraph | Table)[], o: { width: number; fill?: string; vAlign?: 'top' | 'center' | 'bottom'; bottom?: IBorderOptions; marginX?: number } = { width: 0 }) {
  return new TableCell({
    children: children.length ? children : [para([])],
    width: { size: o.width, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: hex(o.fill), color: 'auto' } : undefined,
    verticalAlign: o.vAlign ?? 'center',
    borders: { top: NONE, left: NONE, right: NONE, bottom: o.bottom ?? NONE },
    margins: { left: o.marginX ?? 80, right: o.marginX ?? 80, top: 40, bottom: 40 },
  });
}

function table(widths: number[], rows: TableRow[]) {
  return new Table({
    rows,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
  });
}

function heading(text: string, v: Variant, c: Palette) {
  return para([run(text, { size: v.head + 0.5, bold: true, color: v.fills ? c.goldText : c.grey })], { border: line(c.gold, 6), after: 60 });
}

export function buildInvoiceDocx(invoice: Invoice, logo: LogoImage | null): Document {
  const m: DocModel = buildDocModel(invoice, null);
  const c = paletteFor(invoice.seller.theme);
  const v = VARIANTS[invoice.templateId] ?? VARIANTS.classic;
  const t = m.totals;
  const body = { size: v.body, color: c.ink };
  const grey = { size: v.body, color: c.grey };

  // ── Header: logo | title + meta
  const halfL = Math.round(CONTENT_W * 0.52);
  const halfR = CONTENT_W - halfL;
  const logoCell: Paragraph[] = logo
    ? [
        para([
          new ImageRun({
            type: 'png',
            data: logo.data,
            transformation: fit(logo, v === VARIANTS.minimal ? 120 : 180, v === VARIANTS.compact ? 64 : 110),
          }),
        ]),
      ]
    : [para([run(m.seller.name, { size: v.title * 0.6, bold: true, color: c.navy, font: GEORGIA })])];
  const metaRows: [string, string][] = [
    [m.isCreditNote ? 'Credit Note No.' : 'Invoice No.', m.number],
    ['Invoice Date', m.issueDate],
    ['Payment Terms', m.terms],
    ['Due Date', m.dueDate],
    ['Currency', m.currency],
  ];
  const metaTable = table(
    [Math.round(halfR * 0.48), halfR - Math.round(halfR * 0.48)],
    metaRows.map(
      ([k, val]) =>
        new TableRow({
          children: [
            cell([para([run(k, { size: v.body, bold: true, color: c.grey })], { align: AlignmentType.RIGHT })], { width: Math.round(halfR * 0.48), bottom: line(c.line, 4) }),
            cell([para([run(val, { size: v.body + 0.5, bold: true, color: c.navy })], { align: AlignmentType.RIGHT })], {
              width: halfR - Math.round(halfR * 0.48),
              bottom: line(c.line, 4),
            }),
          ],
        }),
    ),
  );
  const headerTable = table([halfL, halfR], [
    new TableRow({
      children: [
        cell(logoCell, { width: halfL, vAlign: 'top', marginX: 0 }),
        cell(
          [
            para([run(m.title, { size: v.title, bold: true, color: c.navy, font: GEORGIA })], { align: AlignmentType.RIGHT, after: 80 }),
            ...(m.isVoid ? [para([run('VOID', { size: v.title * 0.8, bold: true, color: '#B42318' })], { align: AlignmentType.RIGHT, after: 80 })] : []),
            metaTable,
          ],
          { width: halfR, vAlign: 'top', marginX: 0 },
        ),
      ],
    }),
  ]);

  // ── From / Bill to
  const party = (title: string, name: string, ls: { text: string }[]) => [
    heading(title, v, c),
    para([run(name || ' ', { size: v.body + 1.5, bold: true, color: c.navy })], { after: 40 }),
    ...ls.map((l) => para([run(l.text, grey)], { after: 10 })),
  ];
  const gap = 400;
  const colW = Math.round((CONTENT_W - gap) / 2);
  const parties = table([colW, gap, CONTENT_W - gap - colW], [
    new TableRow({
      children: [
        cell(party('FROM', m.seller.name, m.seller.lines), { width: colW, vAlign: 'top', marginX: 0 }),
        cell([], { width: gap }),
        cell(party(m.isCreditNote ? 'CREDIT TO' : 'BILL TO', m.client.name, m.client.lines), { width: CONTENT_W - gap - colW, vAlign: 'top', marginX: 0 }),
      ],
    }),
  ]);

  // ── Line items
  const weights = [23, 242, 40, 82, 50, 100];
  const sum = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.round((w / sum) * CONTENT_W));
  cols[1] += CONTENT_W - cols.reduce((a, b) => a + b, 0);
  const aligns = [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.RIGHT, AlignmentType.CENTER, AlignmentType.RIGHT];
  const headStyle = { size: v.head, bold: true, color: v.fills ? '#FFFFFF' : c.grey };
  const headers = ['#', 'DESCRIPTION', 'QTY', `UNIT PRICE (${m.currency})`, 'DISC. %', `AMOUNT (VAT EXCLUSIVE) (${m.currency})`];
  const headerRow = new TableRow({
    tableHeader: true, // repeated on every page
    cantSplit: true,
    children: headers.map((h, i) =>
      cell([para([run(h, headStyle)], { align: aligns[i] })], { width: cols[i], fill: v.fills ? c.navy : undefined, bottom: v.fills ? undefined : line(c.navy, 8) }),
    ),
  });
  const rows = m.rows.filter((r) => r.description.trim() || r.amount);
  const itemRows = rows.map((r, k) => {
    const last = k === rows.length - 1;
    const vals = [r.no, r.description, r.qty, r.unitPrice, r.discount, r.amount];
    return new TableRow({
      cantSplit: true,
      children: vals.map((val, i) =>
        cell(
          i === 1 ? lines(val, body) : [para([run(val, i === 0 ? { size: v.body, color: c.light } : i === 5 ? { size: v.body, bold: true, color: c.navy } : body)], { align: aligns[i] })],
          {
            width: cols[i],
            fill: v.banded && k % 2 === 1 ? c.band : undefined,
            bottom: last && v.fills ? line(c.navy, 10) : line(c.line, 4),
          },
        ),
      ),
    });
  });
  const items = table(cols, [headerRow, ...itemRows]);

  // ── Totals (right) and payment details / notes (left)
  const lab = Math.round(colW * 0.62);
  const val = CONTENT_W - gap - colW - lab;
  const trow = (label: string, value: string, kind: 'n' | 'b' | 's' | 'due' | 'bal' = 'n') => {
    const fill = kind === 'due' && v.fills ? c.navy : kind === 'bal' && v.fills ? c.balance : undefined;
    const color = kind === 'due' && v.fills ? '#FFFFFF' : kind === 's' ? c.light : kind === 'n' ? c.grey : c.navy;
    const size = kind === 'due' ? v.body + 2.5 : kind === 'bal' ? v.body + 1.5 : kind === 's' ? v.small : v.body;
    const bold = kind !== 'n' && kind !== 's';
    const bottom = kind === 'bal' ? line(c.gold, 10) : kind === 'due' ? undefined : line(c.line, 4);
    return new TableRow({
      cantSplit: true,
      children: [
        cell([para([run(label, { size: kind === 'due' ? v.body + 1 : size, bold, italic: kind === 's', color })], { align: AlignmentType.RIGHT })], { width: lab, fill, bottom }),
        cell([para([run(value, { size, bold, italic: kind === 's', color })], { align: AlignmentType.RIGHT })], { width: val, fill, bottom }),
      ],
    });
  };
  const totals = table([lab, val], [
    trow('Subtotal', formatMoney(t.subtotal)),
    trow('Discount', formatMoney(-t.discount)),
    trow('Total VAT Exclusive', formatMoney(t.totalVatExclusive), 'b'),
    trow(m.vatLabel, formatMoney(t.vat), 'b'),
    ...(m.notSubjectToVat ? [trow(m.notSubjectToVat, '', 's')] : []),
    trow(`TOTAL VAT INCLUSIVE (${m.currency})`, formatMoney(t.totalVatInclusive, { dashForZero: false }), 'due'),
    trow('Less: amount paid', formatMoney(t.amountPaid)),
    trow('BALANCE DUE', formatMoney(t.balanceDue, { dashForZero: false }), 'bal'),
  ]);
  const left = [
    heading('PAYMENT DETAILS', v, c),
    ...m.bank.map((b) => para([run(b.text, grey)], { after: 20 })),
    para([run(m.reference, { ...grey, bold: true })], { before: 60, after: 80 }),
    ...(m.amountInWords ? [para([run(m.amountInWords, { size: v.body, italic: true, color: c.navy })], { after: 160 })] : []),
    heading('NOTES & TERMS', v, c),
    ...lines(m.notes || ' ', { size: v.small, italic: true, color: c.grey }),
  ];
  const right = [
    totals,
    para([], { after: 500 }),
    para([run(' ', { size: v.small })], { border: line(c.light, 4) }),
    para([run('Authorised signature & company stamp', { size: v.small, color: c.light })], { align: AlignmentType.CENTER }),
  ];
  const bottom = table([colW, gap, CONTENT_W - gap - colW], [
    new TableRow({
      cantSplit: true,
      children: [
        cell(left, { width: colW, vAlign: 'top', marginX: 0 }),
        cell([], { width: gap }),
        cell(right, { width: CONTENT_W - gap - colW, vAlign: 'top', marginX: 0 }),
      ],
    }),
  ]);

  // ── Footer: company line + page x / y
  const footerStyle = { size: v.small, color: v.fills ? '#FFFFFF' : c.light };
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        shading: v.fills ? { type: ShadingType.CLEAR, fill: hex(c.navy), color: 'auto' } : undefined,
        border: v.fills ? { bottom: line(c.gold, 18) } : { top: line(c.line, 4) },
        spacing: { before: 60, after: 0 },
        children: [
          run(m.footer ? `${m.footer}     ` : '', footerStyle),
          new TextRun({ children: ['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: Math.round(v.small * 2), color: hex(footerStyle.color), font: ARIAL }),
        ],
      }),
    ],
  });
  const header = new Header({
    children: v.topBar ? [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 40, color: hex(c.navy) } } })] : [new Paragraph({ children: [] })],
  });

  return new Document({
    creator: 'Invoice Studio',
    title: `${m.isCreditNote ? 'Credit note' : 'VAT invoice'} ${m.number}`,
    description: m.client.name ? `For ${m.client.name}` : undefined,
    styles: { default: { document: { run: { font: ARIAL, size: Math.round(v.body * 2) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 16838 },
            margin: { top: 720, bottom: 900, left: MARGIN_X, right: MARGIN_X, header: 360, footer: 360 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children: [
          headerTable,
          para([], { border: line(c.gold, 24), after: 200, before: 120 }),
          parties,
          para([], { after: 200 }),
          items,
          para([], { after: 200 }),
          bottom,
          para([run('Thank you for your business.', { size: v.body + 3, italic: true, color: c.gold, font: GEORGIA })], { align: AlignmentType.CENTER, before: 300 }),
        ],
      },
    ],
  });
}

/** Scale the logo into a box (pt) keeping its proportions; docx expects pixels at 96 dpi. */
function fit(logo: LogoImage, maxWpt: number, maxHpt: number) {
  const s = Math.min(maxWpt / logo.width, maxHpt / logo.height);
  return { width: Math.round(logo.width * s * (96 / 72)), height: Math.round(logo.height * s * (96 / 72)) };
}
