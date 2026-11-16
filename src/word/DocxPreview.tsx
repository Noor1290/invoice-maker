import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Invoice } from '@/db/types';
import { cn } from '@/lib/utils';

/**
 * Renders an invoice filled into an uploaded Word template (docx-preview).
 * Used by the editor preview, the template preview and the print view.
 */
export function DocxPreview({
  invoice,
  className,
  debounceMs = 350,
  fit = false,
}: {
  invoice: Invoice;
  className?: string;
  debounceMs?: number;
  /** Scale the pages down to the width of the container (editor preview). */
  fit?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!fit || !outerRef.current) return;
    const el = outerRef.current;
    const update = () => {
      const page = el.querySelector<HTMLElement>('section.docx');
      const pageW = page?.offsetWidth || 816;
      setScale(Math.min(1, el.clientWidth / pageW));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, [fit, invoice]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [{ invoiceWordBlob }, { renderAsync }] = await Promise.all([import('./browser'), import('docx-preview')]);
        const blob = await invoiceWordBlob(invoice);
        if (!alive || !bodyRef.current || !styleRef.current) return;
        await renderAsync(blob, bodyRef.current, styleRef.current, {
          className: 'docx',
          inWrapper: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
        });
        if (alive) {
          setState('ready');
          if (fit && outerRef.current) {
            const pageW = outerRef.current.querySelector<HTMLElement>('section.docx')?.offsetWidth || 816;
            setScale(Math.min(1, outerRef.current.clientWidth / pageW));
          }
        }
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        setState('error');
      }
    }, debounceMs);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [invoice, debounceMs, fit]);

  return (
    <div ref={outerRef} className={cn('docx-preview relative', className)}>
      <div ref={styleRef} />
      {state === 'loading' && (
        <div className="absolute inset-x-0 top-8 flex justify-center text-muted" aria-live="polite">
          <Loader2 className="size-5 animate-spin" />
        </div>
      )}
      {state === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-50 p-4 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> This Word template could not be filled: {error}
        </div>
      )}
      <div ref={bodyRef} style={fit ? { zoom: scale } : undefined} className="[&_section.docx]:mx-auto [&_section.docx]:mb-6 [&_section.docx]:bg-white [&_section.docx]:shadow-[0_2px_12px_rgba(11,44,95,.14)]" />
    </div>
  );
}
