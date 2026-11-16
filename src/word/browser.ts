import { Packer } from 'docx';
import { db } from '@/db/db';
import type { Invoice, StoredTemplate } from '@/db/types';
import { uid, nowIso } from '@/lib/utils';
import { buildInvoiceDocx, type LogoImage } from './builtin';
import { buildSampleTemplate } from './sample';
import { buildTagData } from './tags';
import { DOCX_MIME, fillTemplate, inspectTemplate, type TemplateInspection } from './template';

/** Word export (loaded on demand). */

export const isDocxTemplateId = (id: string | undefined) => !!id?.startsWith('docx-');

async function logoImage(): Promise<LogoImage | null> {
  const logo = (await db.settings.get('app'))?.company.logo;
  if (!logo) return null;
  const bmp = await createImageBitmap(logo);
  const out = { data: new Uint8Array(await logo.arrayBuffer()), width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

/** Tag values for an invoice (credit notes also get the number of the invoice they credit). */
export async function tagDataFor(inv: Invoice) {
  const original = inv.creditNoteFor ? await db.invoices.get(inv.creditNoteFor) : undefined;
  return buildTagData(inv, { creditNoteFor: original?.number });
}

/** The invoice as an editable .docx: built-in template layout, or the uploaded Word template filled in. */
export async function invoiceWordBlob(inv: Invoice): Promise<Blob> {
  if (isDocxTemplateId(inv.templateId)) {
    const tpl = await db.templates.get(inv.templateId);
    if (!tpl) throw new Error('The Word template for this invoice was deleted. Choose another template.');
    const filled = fillTemplate(await tpl.file.arrayBuffer(), await tagDataFor(inv));
    return new Blob([filled as Uint8Array<ArrayBuffer>], { type: DOCX_MIME });
  }
  return Packer.toBlob(buildInvoiceDocx(inv, await logoImage()));
}

export async function sampleTemplateBlob(): Promise<Blob> {
  return Packer.toBlob(buildSampleTemplate());
}

/** Check and store an uploaded .docx template. */
export async function addDocxTemplate(file: File): Promise<{ template: StoredTemplate; inspection: TemplateInspection }> {
  if (!/\.docx$/i.test(file.name)) throw new Error('Please choose a Word .docx file (not .doc).');
  if (file.size > 10 * 1024 * 1024) throw new Error('The template is larger than 10 MB.');
  const inspection = inspectTemplate(await file.arrayBuffer());
  if (inspection.errors.length) return { template: null as unknown as StoredTemplate, inspection };
  const template: StoredTemplate = {
    id: `docx-${uid()}`,
    name: file.name.replace(/\.docx$/i, ''),
    kind: 'docx',
    file: new Blob([await file.arrayBuffer()], { type: DOCX_MIME }),
    fileName: file.name,
    tags: [...inspection.tags, ...inspection.itemTags.map((t) => `items.${t}`)],
    createdAt: nowIso(),
  };
  await db.templates.add(template);
  return { template, inspection };
}

/** Delete an uploaded template if no invoice uses it. */
export async function deleteDocxTemplate(id: string): Promise<void> {
  const used = await db.invoices.filter((i) => i.templateId === id).count();
  if (used) throw new Error(`${used} invoice${used === 1 ? ' uses' : 's use'} this template, so it can't be deleted. Switch them to another template first.`);
  await db.transaction('rw', db.templates, db.settings, async () => {
    await db.templates.delete(id);
    await db.settings.where('key').equals('app').modify((s) => {
      if (s.defaults.templateId === id) s.defaults.templateId = 'classic';
    });
  });
}
