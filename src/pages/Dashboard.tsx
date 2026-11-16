import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FilePlus2, Hash, Plus } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/misc';
import { useSequence, useSettings } from '@/hooks/useSettings';
import { db } from '@/db/db';
import { formatNext } from '@/lib/numbering';
import { formatMoney, invoiceTotals } from '@/lib/money';
import { displayStatus, STATUS_META } from '@/lib/status';
import { formatDate } from '@/lib/utils';

/** Phase 2: a simple invoice list. Search, filters and totals cards come in Phase 4. */
export function Dashboard() {
  const settings = useSettings();
  const seq = useSequence(settings);
  const invoices = useLiveQuery(() => db.invoices.orderBy('updatedAt').reverse().toArray(), []);
  const navigate = useNavigate();

  if (!invoices) return null;

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description={settings?.company.name ? `${settings.company.name} · ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}` : undefined}
        actions={
          invoices.length > 0 && (
            <Button asChild>
              <Link to="/invoices/new">
                <Plus /> New invoice
              </Link>
            </Button>
          )
        }
      />

      {invoices.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-navy-50 text-navy">
            <FilePlus2 className="size-7" aria-hidden />
          </div>
          <h2 className="text-2xl">No invoices yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            Create a VAT invoice in a couple of minutes. Pick a template, fill it in, and download it as PDF or Word.
          </p>
          {seq && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-band px-3 py-1 text-sm text-ink">
              <Hash className="size-3.5 text-muted" aria-hidden /> Next invoice: <span className="font-semibold text-navy">{formatNext(seq)}</span>
            </p>
          )}
          <Button asChild size="lg" className="mt-6">
            <Link to="/invoices/new">Create your first invoice</Link>
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Number</th>
                  <th scope="col" className="px-3 py-3 font-medium">Client</th>
                  <th scope="col" className="px-3 py-3 font-medium">Date</th>
                  <th scope="col" className="px-3 py-3 font-medium">Due</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((inv) => {
                  const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
                  const st = STATUS_META[displayStatus(inv)];
                  return (
                    <tr key={inv.id} className="cursor-pointer hover:bg-band/60" onClick={() => navigate(`/invoices/${inv.id}`)}>
                      <td className="px-5 py-3">
                        <Link to={`/invoices/${inv.id}`} className="font-semibold text-navy hover:underline" onClick={(e) => e.stopPropagation()}>
                          {inv.number || '(no number)'}
                        </Link>
                      </td>
                      <td className="max-w-64 truncate px-3 py-3">{inv.client.name || <span className="text-muted">-</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(inv.issueDate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(inv.dueDate)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular">
                        {inv.currency} {formatMoney(t.totalVatInclusive, { dashForZero: false })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}
