import { Document, Font, Image, Page, Text, View, type Styles } from '@react-pdf/renderer';
import type { Invoice } from '@/db/types';
import { buildDocModel } from '@/templates/model';
import { getBuiltInTemplate } from '@/templates/registry';
import { A4, PrimitivesProvider, type Primitives, type Style } from '@/templates/primitives';
import { faceFile, FONT, TEMPLATE_FACES } from '@/templates/fonts';
import type { Measure } from '@/templates/measure';
import { PaletteProvider, paletteFor } from '@/templates/theme';

/**
 * PDF renderer for the shared template layouts. The templates are the very same
 * components the preview uses; only the primitives differ (react-pdf View/Text
 * instead of <div>). Line and page breaks are computed by the template before
 * rendering, so the PDF breaks exactly where the preview does.
 */

type PdfStyle = Styles[string];

function pdfStyle(style: Style | undefined): PdfStyle {
  const out: Record<string, unknown> = {};
  if (!style) return out as PdfStyle;
  for (const [k, v] of Object.entries(style)) if (v !== undefined) out[k] = v;
  for (const side of ['Top', 'Bottom', 'Left', 'Right'] as const) {
    if (style[`border${side}Width`]) out[`border${side}Style`] = 'solid';
  }
  return out as PdfStyle;
}

export const pdfPrimitives: Primitives = {
  kind: 'pdf',
  View: ({ style, children }) => <View style={{ flexShrink: 0, ...pdfStyle(style) }}>{children}</View>,
  Text: ({ style, children }) => <Text style={pdfStyle(style)}>{children}</Text>,
  Image: ({ src, style }) => <Image src={src} style={pdfStyle(style)} />,
  Page: ({ children }) => (
    // Fixed-layout pages: the template has already paginated and every page's content fits.
    // (Note: wrap={false} must NOT be used: react-pdf then drops absolutely positioned content.)
    <Page size="A4" style={{ position: 'relative', width: A4.width, height: A4.height, fontFamily: FONT.arial, fontSize: 9 }}>
      {children}
    </Page>
  ),
};

let registered = false;

/** Register every template font face. `resolve` maps an @fontsource file path to a URL or file path. */
export function registerPdfFonts(resolve: (file: string) => string) {
  if (registered) return;
  const families = new Map<string, { src: string; fontWeight: number; fontStyle: 'normal' | 'italic' }[]>();
  for (const f of TEMPLATE_FACES) {
    const list = families.get(f.family) ?? [];
    list.push({ src: resolve(faceFile(f)), fontWeight: f.weight, fontStyle: f.italic ? 'italic' : 'normal' });
    families.set(f.family, list);
  }
  for (const [family, fonts] of families) Font.register({ family, fonts });
  // Never hyphenate: lines are already broken by the template.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export function pdfTitle(inv: Invoice): string {
  return `${inv.docType === 'credit_note' ? 'Credit note' : 'VAT invoice'} ${inv.number}`.trim();
}

export function InvoicePdfDocument({
  invoice,
  logoSrc,
  measure,
}: {
  invoice: Invoice;
  logoSrc: string | null;
  measure: Measure;
}) {
  const model = buildDocModel(invoice, logoSrc);
  const { Doc } = getBuiltInTemplate(invoice.templateId);
  return (
    <Document
      title={pdfTitle(invoice)}
      author={invoice.seller.name}
      subject={invoice.client.name ? `Invoice to ${invoice.client.name}` : undefined}
      creator="Invoice Studio"
      producer="Invoice Studio"
      language="en"
    >
      <PrimitivesProvider value={pdfPrimitives}>
        <PaletteProvider value={paletteFor(invoice.seller.theme)}>
          <Doc model={model} measure={measure} />
        </PaletteProvider>
      </PrimitivesProvider>
    </Document>
  );
}
