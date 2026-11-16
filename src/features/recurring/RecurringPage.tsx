import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ArrowRight, Pause, Pencil, Play, Repeat, Square } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Badge, Callout, Card } from '@/components/ui/misc';
import { useConfirm } from '@/components/ui/confirm';
import { db } from '@/db/db';
import type { RecurringRule } from '@/db/types';
import { setRecurringStatus, generateDueRecurring } from '@/db/recurringRepo';
import { describeSchedule } from '@/lib/recurrence';
import { formatAmount, invoiceTotals } from '@/lib/money';
import { formatDate } from '@/lib/utils';
import { RecurringDialog } from './RecurringDialog';

const STATUS: Record<RecurringRule['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'navy' }> = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  finished: { label: 'Finished', tone: 'navy' },
};

export function RecurringPage() {
  const rules = useLiveQuery(() => db.recurring.orderBy('nextRunDate').toArray(), []);
  const toReview = useLiveQuery(() => db.invoices.where('status').equals('draft').filter((i) => !!i.recurringRuleId).count(), []);
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();
  if (!rules) return null;
  const order = { active: 0, paused: 1, finished: 2, stopped: 3 };
  const sorted = [...rules].sort((a, b) => order[a.status] - order[b.status] || a.nextRunDate.localeCompare(b.nextRunDate));

  return (
    <Page>
      {dialog}
      <PageHeader
        title="Recurring invoices"
        description="Schedules create draft invoices on each date. You review and issue them."
        actions={
          (toReview ?? 0) > 0 && (
            <Button onClick={() => navigate('/recurring/review')}>
              Review {toReview} draft{toReview === 1 ? '' : 's'} <ArrowRight />
            </Button>
          )
        }
      />
      {sorted.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy">
            <Repeat className="size-6" />
          </div>
          <h2 className="text-xl">No recurring invoices yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            Open an issued invoice, then choose <strong>More ▸ Repeat this invoice</strong> to bill it monthly, quarterly or yearly.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/">Go to invoices</Link>
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Schedule</th>
                  <th scope="col" className="px-3 py-3 font-medium">Repeats</th>
                  <th scope="col" className="px-3 py-3 font-medium">Next invoice</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Amount (excl. VAT)</th>
                  <th scope="col" className="px-3 py-3 font-medium">Created</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((r) => {
                  const t = invoiceTotals(r.content.lines, r.content.vatRate);
                  const live = r.status === 'active' || r.status === 'paused';
                  const last = r.generated.at(-1);
                  return (
                    <tr key={r.id} className="align-top hover:bg-band/60">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-navy">{r.name}</p>
                        <p className="text-xs text-muted">
                          {r.content.client.name} · from{' '}
                          <Link to={`/invoices/${r.sourceInvoiceId}`} className="underline">
                            {r.sourceNumber}
                          </Link>
                        </p>
                      </td>
                      <td className="px-3 py-3 text-muted">{describeSchedule(r)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{live ? formatDate(r.nextRunDate) : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular">
                        {r.content.currency} {formatAmount(t.totalVatExclusive)}
                      </td>
                      <td className="px-3 py-3">
                        {r.createdCount}
                        {last && (
                          <Link to={`/invoices/${last.invoiceId}`} className="ml-1 text-xs text-muted underline">
                            (last {last.number})
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {live && (
                          <Button variant="ghost" size="icon" aria-label={`Edit ${r.name}`} title="Edit" onClick={() => setEditing(r)}>
                            <Pencil />
                          </Button>
                        )}
                        {r.status === 'active' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Pause ${r.name}`}
                            title="Pause"
                            onClick={async () => {
                              await setRecurringStatus(r.id, 'paused');
                              toast(`${r.name} paused. No drafts are created while paused.`);
                            }}
                          >
                            <Pause />
                          </Button>
                        )}
                        {r.status === 'paused' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Resume ${r.name}`}
                            title="Resume"
                            onClick={async () => {
                              await setRecurringStatus(r.id, 'active');
                              const n = (await generateDueRecurring()).length;
                              toast.success(n ? `Resumed. ${n} missed draft${n === 1 ? ' was' : 's were'} created.` : 'Resumed.');
                            }}
                          >
                            <Play />
                          </Button>
                        )}
                        {live && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Stop ${r.name}`}
                            title="Stop"
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Stop “${r.name}”?`,
                                description: 'No more drafts will be created. Invoices already created are kept. This cannot be undone; set up a new schedule to start again.',
                                confirmLabel: 'Stop schedule',
                                tone: 'danger',
                              });
                              if (ok) {
                                await setRecurringStatus(r.id, 'stopped');
                                toast.success('Schedule stopped.');
                              }
                            }}
                          >
                            <Square />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Callout tone="info" className="mt-6">
        Drafts are created when the app is opened. If it wasn't opened for a while, every missed invoice is created with its own
        date, never twice.
      </Callout>
      {editing && <RecurringDialog rule={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}
