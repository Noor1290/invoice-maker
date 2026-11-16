import {
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { DOCUMENT_TAGS, ITEM_TAGS } from './tags';

/**
 * The downloadable sample Word template: every tag once, plus a line-item table whose
 * row repeats for each item ({#items} in the first cell, {/items} in the last).
 */
export function buildSampleTemplate(): Document {
  const W = 10466;
  const t = (text: string, o: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {}) =>
    new TextRun({ text, bold: o.bold, size: (o.size ?? 10) * 2, color: o.color, italics: o.italic, font: 'Arial' });
  const p = (children: TextRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) =>
    new Paragraph({ children, alignment: o.align, spacing: { after: o.after ?? 80 } });
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9DEE7' };
  const cell = (text: string, w: number, o: { head?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      shading: o.head ? { type: ShadingType.CLEAR, fill: '0B2C5F', color: 'auto' } : undefined,
      margins: { left: 80, right: 80, top: 40, bottom: 40 },
      children: [p([t(text, o.head ? { bold: true, color: 'FFFFFF', size: 8 } : { size: 9 })], { align: o.align, after: 0 })],
    });

  const itemCols = [600, 4566, 900, 1600, 1000, 1800];
  const item = (i: number) => ITEM_TAGS.filter((x) => x.tag !== 'vat')[i].tag;
  const itemTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: itemCols,
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['#', 'Description', 'Qty', 'Unit price ({currency})', 'Disc. %', 'Amount excl. VAT'].map((h, i) =>
          cell(h, itemCols[i], { head: true, align: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT }),
        ),
      }),
      // One row in the template, repeated for every line item.
      new TableRow({
        children: [
          cell(`{#items}{${item(0)}}`, itemCols[0]),
          cell(`{${item(1)}}`, itemCols[1]),
          cell(`{${item(2)}}`, itemCols[2], { align: AlignmentType.RIGHT }),
          cell(`{${item(3)}}`, itemCols[3], { align: AlignmentType.RIGHT }),
          cell(`{${item(4)}}`, itemCols[4], { align: AlignmentType.RIGHT }),
          cell(`{${item(5)}} {vat}{/items}`, itemCols[5], { align: AlignmentType.RIGHT }),
        ],
      }),
    ],
  });

  const tagCols = [3600, W - 3600];
  const tagTable = new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: tagCols,
    layout: TableLayoutType.FIXED,
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: DOCUMENT_TAGS.map(
      (d) => new TableRow({ children: [cell(d.label, tagCols[0]), cell(`{${d.tag}}`, tagCols[1])] }),
    ),
  });

  return new Document({
    creator: 'Invoice Studio',
    title: 'Invoice Studio sample template',
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          p([t('Sample template: replace this layout with your own design. Keep the tags in curly braces where the values should appear.', { italic: true, color: '5F6368', size: 8 })], {
            after: 200,
          }),
          p([t('{document_title}', { bold: true, size: 22, color: '0B2C5F' })], { align: AlignmentType.RIGHT, after: 40 }),
          p([t('No. {invoice_number}   ·   {invoice_date}   ·   due {due_date}', { size: 10 })], { align: AlignmentType.RIGHT, after: 300 }),
          p([t('Line items', { bold: true, size: 11, color: '0B2C5F' })]),
          itemTable,
          p([], { after: 200 }),
          p([t('Totals: {total_vat_exclusive} + {vat_label} {vat_total} = {total_vat_inclusive} {currency}', { bold: true, size: 10 })]),
          p([t('Balance due: {balance_due} {currency}  ({amount_in_words})', { size: 10 })], { after: 300 }),
          p([t('All tags', { bold: true, size: 11, color: '0B2C5F' })]),
          tagTable,
        ],
      },
    ],
  });
}
