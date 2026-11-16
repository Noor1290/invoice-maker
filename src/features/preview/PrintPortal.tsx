import { createPortal } from 'react-dom';
import type { Invoice } from '@/db/types';
import { InvoicePages, useTemplateMeasure } from './InvoicePreview';

/**
 * Print-only copy of the invoice pages, rendered straight into <body>.
 * index.css hides everything else when printing and pins the paper to A4 (@page).
 */
export function PrintPortal({ invoice, logoUrl }: { invoice: Invoice; logoUrl: string | null }) {
  const measure = useTemplateMeasure();
  if (!measure) return null;
  return createPortal(
    <div className="print-root" aria-hidden>
      <InvoicePages invoice={invoice} logoUrl={logoUrl} measure={measure} gap={0} />
    </div>,
    document.body,
  );
}

/** Wait until every image in the print copy has loaded and decoded. */
export async function printImagesReady(): Promise<void> {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-root img'));
  await Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
}
