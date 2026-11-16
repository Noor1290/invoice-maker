import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, Loader2, Pencil, Send } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Callout, Card } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { db } from '@/db/db';
import type { Invoice } from '@/db/types';
import { issueInvoice, issueProblems } from '@/db/invoiceRepo';
import { sellerFromSettings } from '@/lib/invoiceFactory';
import { formatAmount, invoiceTotals } from '@/lib/money';
import { cn, formatDate } from '@/lib/utils';
import { useLogoUrl, useSettings } from '@/hooks/useSettings';
import { InvoicePreview } from '@/features/preview/InvoicePreview';
import { DocxPreview } from '@/word/DocxPreview';

/** "Review & issue": every draft created by a schedule, with a preview and one-click issuing. */
export function ReviewPage() {
  const drafts = useLiveQuery(
    () => db.invoices.where('status').equals('draft').filter((i) => !!i.recurringRuleId).sortBy('issueDate'),
    [],
  );
  const settings = useSettings();
  const logoUrl = useLogoUrl(settings?.company);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  // Select everything that can be issued, once, when the list first loads.
  useEffect(() => {
    if (drafts && selected.size === 0 && current === null) {
      setSelected(new Set(drafts.filter((d) => !issueProblems(d).length).map((d) => d.id)));
      setCurrent(drafts[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const shown = useMemo(() => drafts?.find((d) => d.id === current) ?? drafts?.[0], [drafts, current]);
  if (!drafts || !settings) return null;

  const issueSelected = async () => {
    const list = drafts.filter((d) => selected.has(d.id));
    if (!list.length) return;
    const ok = await confirm({
      title: `Issue ${list.length} invoice${list.length === 1 ? '' : 's'}?`,
      description: `${list.map((d) => d.number).join(', ')} will be issued and locked.`,
      confirmLabel: `Issue ${list.length}`,
    });
    if (!ok) return;
    setBusy(true);
    let done = 0;
    const failed: string[] = [];
    for (const d of list) {
      try {
        await issueInvoice({ ...d, seller: sellerFromSettings(settings) });
        done++;
      } catch (e) {
        failed.push(`${d.number}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (failed.length) toast.error(`Issued ${done}. Not issued: ${failed.join(' ')}`, { duration: 12000 });
    else toast.success(`${done} invoice${done === 1 ? '' : 's'} issued.`);
    if (done === list.length && done === drafts.length) navigate('/');
  };

  return (
    <Page className="max-w-[1400px]">
      {dialog}
      <PageHeader
        title="Review recurring invoices"
        description="Check each draft, change anything you need in the editor, then issue them."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to="/recurring">
                <ArrowLeft /> Schedules
              </Link>
            </Button>
            {drafts.length > 0 && (
              <Button onClick={() => void issueSelected()} disabled={busy || selected.size === 0}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Issue {selected.size} selected
              </Button>
            )}
          </>
        }
      />
      {drafts.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <CheckCircle2 className="mb-3 size-10 text-success" />
          <h2 className="text-xl">All caught up</h2>
          <p className="mt-2 text-sm text-muted">There are no recurring drafts waiting to be issued.</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <Card className="h-fit overflow-hidden">
            <label className="flex items-center gap-3 border-b border-line bg-band px-4 py-2.5 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-navy"
                checked={selected.size === drafts.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())}
              />
              Select all ({drafts.length})
            </label>
            <ul className="divide-y divide-line">
              {drafts.map((d) => (
                <DraftRow
                  key={d.id}
                  inv={d}
                  active={shown?.id === d.id}
                  checked={selected.has(d.id)}
                  onCheck={(v) => {
                    const s = new Set(selected);
                    if (v) s.add(d.id);
                    else s.delete(d.id);
                    setSelected(s);
                  }}
                  onShow={() => setCurrent(d.id)}
                />
              ))}
            </ul>
          </Card>
          {shown && (
            <Card className="flex h-[75vh] min-w-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <span className="font-semibold text-navy">{shown.number}</span>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/invoices/${shown.id}`}>
                    <Pencil /> Edit in the editor
                  </Link>
                </Button>
              </div>
              {shown.templateId.startsWith('docx-') ? (
                <div tabIndex={0} role="region" aria-label="Invoice preview" className="min-h-0 flex-1 overflow-auto bg-[#E6E9EF] p-4">
                  <DocxPreview invoice={shown} fit debounceMs={0} />
                </div>
              ) : (
                <InvoicePreview className="min-h-0 flex-1" invoice={shown} logoUrl={logoUrl} />
              )}
            </Card>
          )}
        </div>
      )}
    </Page>
  );
}

function DraftRow({ inv, active, checked, onCheck, onShow }: { inv: Invoice; active: boolean; checked: boolean; onCheck: (v: boolean) => void; onShow: () => void }) {
  const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
  const problems = issueProblems(inv);
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', active && 'bg-navy-50/60')}>
      <input
        type="checkbox"
        className="mt-1 size-4 accent-navy"
        checked={checked}
        disabled={problems.length > 0}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label={`Select ${inv.number}`}
      />
      <button type="button" onClick={onShow} className="min-w-0 flex-1 text-left">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-navy">{inv.number}</span>
          <span className="text-sm font-medium tabular">
            {inv.currency} {formatAmount(t.totalVatInclusive)}
          </span>
        </p>
        <p className="truncate text-sm text-ink">{inv.client.name}</p>
        <p className="truncate text-xs text-muted">
          {formatDate(inv.issueDate)} · {inv.lines[0]?.description}
        </p>
        {problems.length > 0 && <Callout tone="warning" className="mt-2 px-2 py-1 text-xs">{problems.join(' ')}</Callout>}
      </button>
    </li>
  );
}
