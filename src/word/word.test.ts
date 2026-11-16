import { describe, expect, it } from 'vitest';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PizZip from 'pizzip';
import { defaultSettings } from '@/db/defaults';
import { sampleInvoice } from '@/templates/sample';
import { newLine } from '@/lib/invoiceFactory';
import type { Invoice } from '@/db/types';
import { buildSampleTemplate } from './sample';
import { fillTemplate, inspectTemplate } from './template';
import { buildTagData, DOCUMENT_TAGS } from './tags';
import { buildInvoiceDocx } from './builtin';

const bytes = async (doc: Document) => new Uint8Array(await Packer.toBuffer(doc));

/** Visible text of a .docx (document + footers). */
function docText(docx: Uint8Array): string {
  const zip = new PizZip(docx);
  return Object.keys(zip.files)
    .filter((f) => /^word\/(document|footer\d*)\.xml$/.test(f))
    .map((f) =>
      zip
        .file(f)!
        .asText()
        .replace(/<w:tab\/>/g, ' ')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"'),
    )
    .join('\n');
}

function acceptanceInvoice(): Invoice {
  const s = defaultSettings();
  s.company.name = 'Acme Trading Ltd';
  s.sequences[0] = { ...s.sequences[0], prefix: 'PSINV', nextNumber: 1245, minDigits: 4 };
  const inv = sampleInvoice(s, 'classic');
  inv.client.name = 'ABC Ltd';
  return inv;
}

const simpleDocx = (text: string) => bytes(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }] }));

describe('sample template', () => {
  it('contains every tag and the items loop, with nothing unknown or missing', async () => {
    const r = inspectTemplate(await bytes(buildSampleTemplate()));
    expect(r.errors).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.renamed).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.hasItemsLoop).toBe(true);
    for (const t of DOCUMENT_TAGS) expect(r.tags).toContain(t.tag);
    expect(r.itemTags.sort()).toEqual(['amount', 'description', 'discount', 'no', 'qty', 'unit_price', 'vat'].sort());
  });
});

describe('Acceptance 8: a .docx with tags fills in correctly, including 20+ line items', () => {
  it('fills the sample with a 25-line invoice', async () => {
    const inv = acceptanceInvoice();
    inv.lines = Array.from({ length: 25 }, (_, i) =>
      newLine(undefined, { description: `Consulting item ${i + 1}`, qty: 2, unitPrice: 100 + i, noVat: i === 24 }),
    );
    const out = fillTemplate(await bytes(buildSampleTemplate()), buildTagData(inv));
    const text = docText(out);
    for (let i = 1; i <= 25; i++) expect(text).toContain(`Consulting item ${i}`);
    expect(text).toContain('No VAT'); // item 25
    expect(text).not.toMatch(/\{[#/]?[a-z_]+\}/); // no tag left unfilled
    // 25 item rows + header row in the line-item table
    const xml = new PizZip(out).file('word/document.xml')!.asText();
    const itemTable = xml.split('<w:tbl>')[1];
    expect(itemTable.match(/<w:tr[ >]/g)!.length).toBe(26);
  });

  it('uses the new VAT tags and totals', async () => {
    const inv = acceptanceInvoice();
    const text = docText(fillTemplate(await bytes(buildSampleTemplate()), buildTagData(inv)));
    expect(text).toContain('26,480.00 + VAT @ 15% 3,792.00 = 30,272.00 MUR');
    expect(text).toContain('Thirty thousand two hundred and seventy-two rupees only');
    expect(text).toContain('VAT INVOICE');
  });

  it('credit notes fill the title and the credited invoice', async () => {
    const inv = { ...acceptanceInvoice(), docType: 'credit_note' as const, number: 'CN-0001' };
    const text = docText(fillTemplate(await bytes(buildSampleTemplate()), buildTagData(inv, { creditNoteFor: 'PSINV1245' })));
    expect(text).toContain('CREDIT NOTE');
    expect(text).toContain('CN-0001');
    expect(text).toContain('PSINV1245');
  });
});

describe('upload checks', () => {
  it('reports renamed, unknown and missing tags', async () => {
    const r = inspectTemplate(await simpleDocx('{invoice_number} {total_due} {foo} {description}'));
    expect(r.renamed).toEqual([{ from: 'total_due', to: 'total_vat_inclusive' }]);
    expect(r.unknown).toContain('{foo}');
    expect(r.unknown).toContain('{description} must be inside {#items}…{/items}');
    expect(r.missing).toContain('{client_name}');
    expect(r.missing).toContain('{#items}…{/items}');
  });

  it('explains syntax errors instead of failing', async () => {
    const r = inspectTemplate(await simpleDocx('{invoice_number'));
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects files that are not .docx', () => {
    expect(() => inspectTemplate(new TextEncoder().encode('hello'))).toThrow(/not a valid \.docx/);
  });
});

describe('built-in templates → Word', () => {
  it.each(['classic', 'minimal', 'compact'])('%s: totals, VAT label and page numbers', async (tpl) => {
    const inv = { ...acceptanceInvoice(), templateId: tpl };
    const docx = await bytes(buildInvoiceDocx(inv, null));
    const text = docText(docx);
    for (const s of ['VAT INVOICE', 'PSINV1245', 'ABC Ltd', '26,900.00', '(420.00)', '26,480.00', 'VAT @ 15%', '3,792.00',
      'Includes 1,200.00 not subject to VAT', 'TOTAL VAT INCLUSIVE (MUR)', '30,272.00', 'BALANCE DUE',
      'Thirty thousand two hundred and seventy-two rupees only', 'BILL TO']) {
      expect(text, s).toContain(s);
    }
    const xml = new PizZip(docx).file('word/document.xml')!.asText();
    expect(xml).toContain('<w:tblHeader'); // header row repeats on every page
    expect(xml).toContain('676D74'); // captions in the readable grey
    expect(xml).not.toContain('9AA0A6');
    const footer = Object.keys(new PizZip(docx).files).find((f) => f.startsWith('word/footer'))!;
    expect(new PizZip(docx).file(footer)!.asText()).toMatch(/PAGE|NUMPAGES/);
  });

  it('credit notes export to Word', async () => {
    const inv: Invoice = { ...acceptanceInvoice(), docType: 'credit_note', number: 'CN-0001' };
    const text = docText(await bytes(buildInvoiceDocx(inv, null)));
    expect(text).toContain('CREDIT NOTE');
    expect(text).toContain('Credit Note No.');
    expect(text).toContain('CREDIT TO');
    expect(text).toContain('CN-0001');
  });

  it('embeds the logo when there is one', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
    const docx = await bytes(buildInvoiceDocx(acceptanceInvoice(), { data: png, width: 300, height: 200 }));
    expect(Object.keys(new PizZip(docx).files).some((f) => f.startsWith('word/media/'))).toBe(true);
  });
});
