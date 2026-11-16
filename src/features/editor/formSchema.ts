import { z } from 'zod';
import type { Invoice } from '@/db/types';

const num = (msg: string) => z.number({ error: msg }).refine((n) => Number.isFinite(n), msg);

export const lineSchema = z.object({
  id: z.string(),
  productId: z.string().optional(),
  description: z.string(),
  qty: num('Enter a quantity').refine((n) => n >= 0, "Quantity can't be negative"),
  unitPrice: num('Enter a price').refine((n) => n >= 0, "Price can't be negative"),
  discountPct: num('Enter a discount').refine((n) => n >= 0 && n <= 100, 'Between 0 and 100%'),
  noVat: z.boolean(),
});

export const invoiceFormSchema = z.object({
  number: z.string(),
  sequenceId: z.string(),
  issueDate: z.string().min(1, 'Pick the invoice date'),
  dueDate: z.string(),
  termsDays: z
    .number({ error: 'Enter the number of days' })
    .int('Whole days only')
    .min(0, "Can't be negative")
    .max(365, 'At most 365 days'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter code, e.g. MUR'),
  vatRate: num('Enter the VAT rate').refine((n) => n >= 0 && n <= 100, 'Between 0 and 100%'),
  client: z.object({
    clientId: z.string().optional(),
    name: z.string(),
    address: z.string(),
    brn: z.string(),
    vatNo: z.string(),
    attention: z.string(),
    email: z.union([z.literal(''), z.email('Enter a valid email address')]),
    phone: z.string(),
  }),
  lines: z.array(lineSchema),
  notes: z.string(),
  templateId: z.string(),
});

export type InvoiceForm = z.infer<typeof invoiceFormSchema>;

export function toForm(inv: Invoice): InvoiceForm {
  return {
    number: inv.number,
    sequenceId: inv.sequenceId,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    termsDays: inv.termsDays,
    currency: inv.currency,
    vatRate: inv.vatRate,
    client: { ...inv.client },
    lines: inv.lines.map((l) => ({ ...l })),
    notes: inv.notes,
    templateId: inv.templateId,
  };
}

/** Form field path → DOM id of its input ("lines.2.qty" → "f-lines-2-qty"). */
export const fieldId = (path: string) => `f-${path.replace(/\./g, '-')}`;
