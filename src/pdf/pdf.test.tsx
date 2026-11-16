import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvoicePdfDocument, registerPdfFonts } from './InvoicePdf';
import { defaultSettings } from '@/db/defaults';
import { sampleInvoice } from '@/templates/sample';
import { approxMeasure } from '@/templates/measure';
import { InvoicePages } from '@/features/preview/InvoicePreview';
import { newLine } from '@/lib/invoiceFactory';
import { invoiceFileName } from '@/lib/filename';
import type { Invoice } from '@/db/types';

const root = process.cwd();
const logo = path.join(root, 'public/icons/icon-192.png'); // any PNG works as a test logo

beforeAll(() => {
  registerPdfFonts((file) => path.join(root, 'node_modules', file));
});

/** The acceptance-test invoice (Excel example rows; the disbursement is "No VAT"). */
function acceptanceInvoice(templateId = 'classic', vatRate = 15): Invoice {
  const s = defaultSettings();
  s.sequences[0] = { ...s.sequences[0], prefix: 'PSINV', nextNumber: 1245, minDigits: 4 };
  const inv = sampleInvoice(s, templateId);
  inv.vatRate = vatRate;
  inv.client.name = 'ABC Ltd';
  return inv;
}

async function pdfItems(buf: Buffer) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(tc.items.map((i) => ('str' in i ? i.str : '')));
  }
  return pages;
}
async function pdfText(buf: Buffer) {
  return (await pdfItems(buf)).map((items) => items.join(' '));
}

const render = (inv: Invoice) =>
  renderToBuffer(<InvoicePdfDocument invoice={inv} logoSrc={logo} measure={approxMeasure} />) as Promise<Buffer>;

describe('PDF generation', () => {
  it('acceptance invoice: totals are in the PDF as selectable text', async () => {
    const buf = await render(acceptanceInvoice());
    const [text, ...rest] = await pdfText(buf);
    expect(rest).toHaveLength(0); // one page
    for (const s of [
      'VAT INVOICE',
      'PSINV1245',
      'ABC Ltd',
      '26,900.00', // subtotal
      '(420.00)', // discount
      '26,480.00', // Total VAT Exclusive
      'VAT @ 15%',
      '3,792.00',
      'Includes 1,200.00 not subject to VAT',
      'TOTAL VAT INCLUSIVE (MUR)',
      '30,272.00',
      'Thirty thousand two hundred and seventy-two rupees only',
    ]) {
      expect(text, s).toContain(s);
    }
  }, 30_000);

  it('embeds the template fonts (Arimo, Gelasio) and no fallback fonts', async () => {
    const buf = await render(acceptanceInvoice());
    const raw = buf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Arimo/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+Gelasio/);
    expect(raw).toContain('/FontFile2');
    expect(raw).not.toMatch(/\/BaseFont \/Helvetica/);
    const meta = await (await getDocument({ data: new Uint8Array(buf) }).promise).getMetadata();
    expect((meta.info as { Title?: string }).Title).toBe('VAT invoice PSINV1245');
  }, 30_000);

  it('a VAT rate of 12.5% updates the totals and the label', async () => {
    const [text] = await pdfText(await render(acceptanceInvoice('classic', 12.5)));
    expect(text).toContain('VAT @ 12.5%');
    expect(text).toContain('3,160.00');
    expect(text).toContain('29,640.00');
  }, 30_000);

  it.each(['classic', 'minimal', 'compact'])('%s: long invoices continue over pages with the header repeated', async (tpl) => {
    const inv = acceptanceInvoice(tpl);
    inv.lines = Array.from({ length: 80 }, (_, i) => newLine(undefined, { description: `Consulting hours, item ${i + 1}`, unitPrice: 100 + i }));
    const items = await pdfItems(await render(inv));
    const pages = items.map((i) => i.join(' '));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p, k) => {
      expect(p).toContain('DESCRIPTION'); // table header repeated
      // page counter drawn as ONE line of text (not wrapped word by word)
      expect(items[k]).toContain(`${k + 1} / ${pages.length}`);
    });
    expect(pages.at(-1)).toContain('BALANCE DUE');
    expect(pages.join(' ')).toContain('Consulting hours, item 80');
  }, 60_000);

  it('PDF and preview paginate identically (same layout code, same measurements)', async () => {
    const inv = acceptanceInvoice('compact');
    inv.lines = Array.from({ length: 60 }, (_, i) => newLine(undefined, { description: `Item ${i + 1}`, unitPrice: 50 }));
    const html = renderToStaticMarkup(<InvoicePages invoice={inv} logoUrl={logo} measure={approxMeasure} />);
    const htmlPages = html.match(/class="invoice-page"/g)!.length;
    const pdfPages = (await pdfText(await render(inv))).length;
    expect(pdfPages).toBe(htmlPages);
    // captions (#, signature line) use the AA grey, never the old light grey
    expect(html.toLowerCase()).toContain('#676d74');
    expect(html.toLowerCase()).not.toContain('#9aa0a6');
  }, 60_000);
});

describe('file name', () => {
  it('{InvoiceNo}_{ClientName}.pdf without characters Windows forbids', () => {
    expect(invoiceFileName('PSINV1245', 'ABC Ltd', 'pdf')).toBe('PSINV1245_ABC Ltd.pdf');
    expect(invoiceFileName('INV/2026:0001', 'A<B>C "Co" | Ltd?*', 'pdf')).toBe('INV20260001_ABC Co Ltd.pdf');
    expect(invoiceFileName('INV-1', 'Trailing dots...', 'pdf')).toBe('INV-1_Trailing dots.pdf');
    expect(invoiceFileName('', '', 'pdf')).toBe('Invoice.pdf');
    expect(invoiceFileName('CON', '', 'pdf')).toBe('CON_invoice.pdf');
  });
});
