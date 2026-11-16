import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { db } from '@/db/db';
import type { Invoice } from '@/db/types';
import { nextAvailableNumber } from '@/db/invoiceRepo';
import { getSettings } from '@/db/settingsRepo';
import { useSettings } from '@/hooks/useSettings';
import { newInvoice } from '@/lib/invoiceFactory';
import { addDays, formatDate, nowIso, uid } from '@/lib/utils';
import { partyFromClient } from '@/db/recordsRepo';
import { Page } from '@/components/layout/AppShell';
import { Callout } from '@/components/ui/misc';
import { InvoiceEditor } from './InvoiceEditor';

/**
 * /invoices/new            → fresh draft with smart defaults (number not reserved until first autosave)
 * /invoices/new?from=<id>  → duplicate (same client, lines, notes; new number and today's date)
 * /invoices/:id            → open a saved invoice
 */
export function EditorPage() {
  const { id = 'new' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const settings = useSettings();
  const [state, setState] = useState<{ invoice: Invoice; isNew: boolean } | 'missing' | null>(null);
  const loadedId = useRef<string | null>(null);
  const ready = !!settings;

  useEffect(() => {
    if (!ready) return;
    if (id !== 'new' && loadedId.current === id) return; // same invoice (e.g. URL updated after first save)
    let alive = true;
    void (async () => {
      const s = await getSettings();
      if (id === 'new') {
        const creditFor = params.get('creditFor');
        const original = creditFor ? await db.invoices.get(creditFor) : undefined;
        const seq =
          (original ? s.sequences.find((x) => x.docType === 'credit_note') : undefined) ??
          s.sequences.find((x) => x.id === (params.get('seq') ?? s.defaultSequenceId)) ??
          s.sequences[0];
        const { number } = seq.mode === 'auto' ? await nextAvailableNumber(seq) : { number: '' };
        let inv = newInvoice(s, seq, number);
        const from = params.get('from');
        const src = from ? await db.invoices.get(from) : undefined;
        if (src) {
          inv = {
            ...inv,
            client: { ...src.client },
            lines: src.lines.map((l) => ({ ...l, id: uid() })),
            notes: src.notes,
            currency: src.currency,
            vatRate: src.vatRate,
            templateId: src.templateId,
            termsDays: src.termsDays,
            dueDate: addDays(inv.issueDate, src.termsDays),
            history: [{ at: nowIso(), type: 'duplicated', detail: `Duplicated from ${src.number}` }],
          };
        }
        if (original) {
          inv = {
            ...inv,
            docType: 'credit_note',
            creditNoteFor: original.id,
            client: { ...original.client },
            lines: original.lines.map((l) => ({ ...l, id: uid() })),
            currency: original.currency,
            vatRate: original.vatRate,
            templateId: original.templateId,
            notes: `Credit note for invoice ${original.number} dated ${formatDate(original.issueDate)}.`,
            history: [{ at: nowIso(), type: 'credit_note', detail: `Credit note for ${original.number}` }],
          };
        }
        const clientId = params.get('client');
        const client = clientId ? await db.clients.get(clientId) : undefined;
        if (client && !src && !original) inv = { ...inv, client: partyFromClient(client) };
        if (!alive) return;
        loadedId.current = inv.id;
        setState({ invoice: inv, isNew: true });
      } else {
        const inv = await db.invoices.get(id);
        if (!alive) return;
        loadedId.current = inv?.id ?? null;
        setState(inv ? { invoice: inv, isNew: false } : 'missing');
      }
    })();
    return () => {
      alive = false;
    };
    // location.key: clicking "New invoice" again starts a fresh one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready, location.key]);

  if (state === 'missing')
    return (
      <Page>
        <Callout tone="warning">
          This invoice doesn't exist in this browser. <Link to="/" className="underline">Back to invoices</Link>
        </Callout>
      </Page>
    );
  if (!state || !settings) return null;
  return <InvoiceEditor key={state.invoice.id} initial={state.invoice} isNew={state.isNew} settings={settings} />;
}
