import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { Invoice } from '@/db/types';
import { buildDocModel } from '@/templates/model';
import { getBuiltInTemplate } from '@/templates/registry';
import { createCanvasMeasure, type Measure } from '@/templates/measure';
import { loadTemplateFonts } from '@/templates/fonts';
import { A4, htmlPrimitives, PrimitivesProvider } from '@/templates/primitives';
import { cn } from '@/lib/utils';
import { PaletteProvider, paletteFor } from '@/templates/theme';

const PAGE_PX = (A4.width * 4) / 3;

let sharedMeasure: Measure | null = null;

/** The canvas text measurer (shared by preview, print and PDF), once template fonts are loaded. */
export async function getTemplateMeasure(): Promise<Measure> {
  await loadTemplateFonts();
  sharedMeasure ??= createCanvasMeasure();
  return sharedMeasure;
}

/** Canvas text measurer, available once the template fonts have loaded. */
export function useTemplateMeasure(): Measure | null {
  // Wrap in a function, otherwise React would treat the measurer as a lazy initializer and call it.
  const [measure, setMeasure] = useState<Measure | null>(() => sharedMeasure);
  useEffect(() => {
    if (sharedMeasure) return;
    let alive = true;
    void getTemplateMeasure().then((m) => alive && setMeasure(() => m));
    return () => {
      alive = false;
    };
  }, []);
  return measure;
}

/** Renders invoice pages as HTML (exact A4, pt units). Used by the preview, thumbnails and print view. */
export function InvoicePages({
  invoice,
  logoUrl,
  numberOverride,
  measure,
  gap = 24,
  logoPlaceholder = false,
}: {
  invoice: Invoice;
  logoUrl: string | null;
  numberOverride?: string;
  measure: Measure;
  gap?: number;
  logoPlaceholder?: boolean;
}) {
  const model = useMemo(
    () => buildDocModel(invoice, logoUrl, numberOverride, { logoPlaceholder }),
    [invoice, logoUrl, numberOverride, logoPlaceholder],
  );
  const { Doc } = getBuiltInTemplate(invoice.templateId);
  return (
    <PrimitivesProvider value={htmlPrimitives}>
      <PaletteProvider value={paletteFor(invoice.seller.theme)}>
        <div className="invoice-pages flex flex-col" style={{ gap }}>
          <Doc model={model} measure={measure} />
        </div>
      </PaletteProvider>
    </PrimitivesProvider>
  );
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

interface PreviewProps {
  invoice: Invoice;
  logoUrl: string | null;
  numberOverride?: string;
  activeField?: string | null;
  onFieldClick?: (field: string) => void;
  className?: string;
}

/** Live A4 preview with zoom controls, click-to-focus and active-field highlighting. */
export function InvoicePreview({ invoice, logoUrl, numberOverride, activeField, onFieldClick, className }: PreviewProps) {
  const measure = useTemplateMeasure();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const hoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = width ? Math.max(0.3, Math.min(1.5, (width - 48) / PAGE_PX)) : 0.75;
  const scale = zoom === 'fit' ? fit : zoom;

  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.01) : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
    if (next) setZoom(next);
  };

  const highlightCss = activeField
    ? `.inv-preview [data-field="${CSS.escape(activeField)}"]{box-shadow:0 0 0 1.5px #C9A243, inset 0 0 0 999px rgba(201,162,67,.16);border-radius:1px}`
    : '';

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="no-print flex items-center justify-between gap-2 border-b border-line bg-white/80 px-4 py-2 backdrop-blur">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Live preview · A4</span>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-band hover:text-ink"
            onClick={() => step(-1)}
            aria-label="Zoom out"
          >
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular text-ink" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-band hover:text-ink"
            onClick={() => step(1)}
            aria-label="Zoom in"
          >
            <Plus className="size-4" />
          </button>
          <button
            type="button"
            className={cn(
              'ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              zoom === 'fit' ? 'bg-navy-50 text-navy' : 'text-muted hover:bg-band',
            )}
            onClick={() => setZoom('fit')}
          >
            <Maximize2 className="size-3.5" /> Fit
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[#E6E9EF] p-6">
        <style>{highlightCss}</style>
        {measure ? (
          <div
            className={cn('inv-preview mx-auto', onFieldClick && 'interactive')}
            style={{ zoom: scale, width: PAGE_PX }}
            onClick={(e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
              if (el?.dataset.field) onFieldClick?.(el.dataset.field);
            }}
            onMouseOver={(e) => {
              if (!onFieldClick) return;
              const el = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
              if (hoverRef.current && hoverRef.current !== el) hoverRef.current.style.outline = '';
              if (el) {
                el.style.outline = '1px dashed rgba(201,162,67,.9)';
                el.style.cursor = 'pointer';
              }
              hoverRef.current = el;
            }}
            onMouseLeave={() => {
              if (hoverRef.current) hoverRef.current.style.outline = '';
              hoverRef.current = null;
            }}
          >
            <div className="[&_.invoice-page]:shadow-[0_2px_12px_rgba(11,44,95,.14)]">
              <InvoicePages invoice={invoice} logoUrl={logoUrl} numberOverride={numberOverride} measure={measure} logoPlaceholder />
            </div>
          </div>
        ) : (
          <div className="mx-auto aspect-[210/297] w-full max-w-[600px] animate-pulse rounded bg-white/70" />
        )}
      </div>
    </div>
  );
}
