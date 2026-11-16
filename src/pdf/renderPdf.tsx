import { pdf } from '@react-pdf/renderer';
import type { Invoice } from '@/db/types';
import { getTemplateMeasure } from '@/features/preview/InvoicePreview';
import { InvoicePdfDocument, registerPdfFonts } from './InvoicePdf';
import { browserFontSource } from './fontUrls';

/** Logo (object URL or bundled asset URL) → data URL the PDF engine can embed. */
async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Generate the invoice PDF in the browser: A4, embedded fonts, selectable text,
 * same layout code and text measurements as the on-screen preview.
 * (This module is loaded on demand; the PDF engine is large.)
 */
export async function renderInvoicePdf(invoice: Invoice, logoUrl: string | null): Promise<Blob> {
  registerPdfFonts(browserFontSource);
  const [measure, logo] = await Promise.all([getTemplateMeasure(), logoUrl ? toDataUrl(logoUrl) : Promise.resolve(null)]);
  return pdf(<InvoicePdfDocument invoice={invoice} logoSrc={logo} measure={measure} />).toBlob();
}
