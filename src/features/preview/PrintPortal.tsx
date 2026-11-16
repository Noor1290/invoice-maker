import { createPortal } from 'react-dom';
import type { Invoice } from '@/db/types';
import { InvoicePages, useTemplateMeasure } from './InvoicePreview';
import { DocxPreview } from '@/word/DocxPreview';

/**
 * Print-only copy of the invoice pages, rendered straight into <body>.
 * index.css hides everything else when printing and pins the paper to A4 (@page).
 */
export function PrintPortal({ invoice, logoUrl }: { invoice: Invoice; logoUrl: string | null }) {
  const measure = useTemplateMeasure();
  if (!measure) return null;
  return createPortal(
    <div className="print-root" aria-hidden>
      {invoice.templateId.startsWith('docx-') ? (
        <DocxPreview invoice={invoice} debounceMs={0} />
      ) : (
        <InvoicePages invoice={invoice} logoUrl={logoUrl} measure={measure} gap={0} />
      )}
    </div>,
    document.body,
  );
}

/** Wait until the print copy is rendered and every image in it has loaded and decoded. */
export async function printImagesReady(): Promise<void> {
  // Word templates render asynchronously.
  if (document.querySelector('.print-root .docx-preview')) {
    for (let i = 0; i < 100 && !document.querySelector('.print-root section.docx'); i++) await new Promise((r) => setTimeout(r, 50));
  }
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-root img'));
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
}
