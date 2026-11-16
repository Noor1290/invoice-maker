import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, CircleDollarSign, FilePlus2, Hash, Plus, Repeat, Search, Wallet, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { GuideCard } from '@/features/guide/GettingStarted';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Card } from '@/components/ui/misc';
import { useSequence, useSettings } from '@/hooks/useSettings';
import { db } from '@/db/db';
import type { DisplayStatus, Invoice } from '@/db/types';
import { formatNext } from '@/lib/numbering';
import { formatAmount, formatMoney, invoiceTotals } from '@/lib/money';
import { displayStatus, STATUS_META } from '@/lib/status';
import { cn, formatDate, todayIso } from '@/lib/utils';

interface Row {
  inv: Invoice;
  status: DisplayStatus;
  total: number;
  balance: number;
}

function sumByCurrency(items: { currency: string; amount: number }[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.currency, (m.get(i.currency) ?? 0) + i.amount);
  return m;
}

export function Dashboard() {
  const settings = useSettings();
  const seq = useSequence(settings);
  const invoices = useLiveQuery(() => db.invoices.orderBy('updatedAt').reverse().toArray(), []);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | DisplayStatus>('');
  const [client, setClient] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rows = useMemo<Row[]>(
    () =>
      (invoices ?? []).map((inv) => {
        const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
        return { inv, status: displayStatus(inv), total: t.totalVatInclusive, balance: t.balanceDue };
      }),
    [invoices],
  );

  const today = todayIso();
  const month = today.slice(0, 7);
  const cur = settings?.defaults.currency ?? 'MUR';
  const cards = useMemo(() => {
    const live = rows.filter((r) => r.inv.docType === 'invoice' && ['issued', 'partially_paid', 'overdue'].includes(r.status));
    const outstanding = sumByCurrency(live.map((r) => ({ currency: r.inv.currency, amount: r.balance })));
    const overdueRows = live.filter((r) => r.status === 'overdue');
    const overdue = sumByCurrency(overdueRows.map((r) => ({ currency: r.inv.currency, amount: r.balance })));
    const paid = sumByCurrency(
      rows.flatMap((r) => r.inv.payments.filter((p) => p.date.startsWith(month)).map((p) => ({ currency: r.inv.currency, amount: p.amount }))),
    );
    return { outstanding, overdue, overdueCount: overdueRows.length, paid, outstandingCount: live.length };
  }, [rows, month]);

  const clients = useMemo(() => [...new Set(rows.map((r) => r.inv.client.name.trim()).filter(Boolean))].sort(), [rows]);

  const filtered = rows.filter(({ inv, status: st }) => {
    const ql = q.trim().toLowerCase();
    if (ql && !`${inv.number} ${inv.client.name} ${inv.client.vatNo}`.toLowerCase().includes(ql)) return false;
    if (status && st !== status) return false;
    if (client && inv.client.name.trim() !== client) return false;
    if (from && inv.issueDate < from) return false;
    if (to && inv.issueDate > to) return false;
    return true;
  });
  const filtering = !!(q || status || client || from || to);

  if (!invoices || !settings) return null;

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description={settings.company.name ? `${settings.company.name} · ${invoices.length} document${invoices.length === 1 ? '' : 's'}` : undefined}
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

      <RecurringNotice />
      <GuideCard />
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
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <TotalCard
              icon={<Wallet />}
              label="Outstanding"
              amounts={cards.outstanding}
              currency={cur}
              sub={`${cards.outstandingCount} unpaid invoice${cards.outstandingCount === 1 ? '' : 's'}`}
              onClick={() => setStatus('')}
            />
            <TotalCard
              icon={<AlertCircle />}
              label="Overdue"
              amounts={cards.overdue}
              currency={cur}
              tone="danger"
              sub={`${cards.overdueCount} invoice${cards.overdueCount === 1 ? '' : 's'} past due`}
              onClick={() => setStatus('overdue')}
            />
            <TotalCard
              icon={<CircleDollarSign />}
              label="Paid this month"
              amounts={cards.paid}
              currency={cur}
              tone="success"
              sub={new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
              <label className="relative min-w-56 flex-1">
                <span className="sr-only">Search</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number or client" className="pl-9" />
              </label>
              <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as DisplayStatus | '')}>
                <option value="">All statuses</option>
                {(Object.keys(STATUS_META) as DisplayStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Client" value={client} onChange={setClient}>
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </FilterSelect>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                From
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 w-40" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                To
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 w-40" />
              </label>
              {filtering && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQ('');
                    setStatus('');
                    setClient('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  <X /> Clear
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-muted">No invoices match these filters.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-medium">Number</th>
                      <th scope="col" className="px-3 py-3 font-medium">Client</th>
                      <th scope="col" className="px-3 py-3 font-medium">Date</th>
                      <th scope="col" className="px-3 py-3 font-medium">Due</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
                      <th scope="col" className="px-3 py-3 text-right font-medium">Balance</th>
                      <th scope="col" className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map(({ inv, status: st, total, balance }) => {
                      const meta = STATUS_META[st];
                      return (
                        <tr key={inv.id} className="cursor-pointer hover:bg-band/60" onClick={() => navigate(`/invoices/${inv.id}`)}>
                          <td className="whitespace-nowrap px-5 py-3">
                            <Link
                              to={`/invoices/${inv.id}`}
                              className="font-semibold text-navy hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {inv.number || '(no number)'}
                            </Link>
                            {inv.docType === 'credit_note' && <Badge tone="gold" className="ml-2">Credit note</Badge>}
                          </td>
                          <td className="max-w-64 truncate px-3 py-3">{inv.client.name || <span className="text-muted">-</span>}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(inv.issueDate)}</td>
                          <td className={cn('whitespace-nowrap px-3 py-3', st === 'overdue' ? 'font-medium text-danger' : 'text-muted')}>
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular">
                            {inv.currency} {formatMoney(total, { dashForZero: false })}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular">
                            {st === 'void' || st === 'draft' ? <span className="text-muted">-</span> : formatMoney(balance)}
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className="w-44 text-ink">
        {children}
      </NativeSelect>
    </label>
  );
}

function TotalCard({
  icon,
  label,
  amounts,
  currency,
  sub,
  tone = 'navy',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  amounts: Map<string, number>;
  currency: string;
  sub: string;
  tone?: 'navy' | 'danger' | 'success';
  onClick?: () => void;
}) {
  const main = amounts.get(currency) ?? 0;
  const others = [...amounts.entries()].filter(([c, v]) => c !== currency && v !== 0);
  return (
    <Card
      className={cn('p-5', onClick && 'cursor-pointer transition-shadow hover:shadow-pop')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted">
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-lg [&_svg]:size-4',
            tone === 'navy' && 'bg-navy-50 text-navy',
            tone === 'danger' && 'bg-danger-50 text-danger',
            tone === 'success' && 'bg-success-50 text-success',
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <p className={cn('mt-3 font-serif text-2xl font-semibold tabular', tone === 'danger' && main > 0 ? 'text-danger' : 'text-navy')}>
        <span className="mr-1 font-sans text-sm font-medium text-muted">{currency}</span>
        {formatAmount(main)}
      </p>
      {others.map(([c, v]) => (
        <p key={c} className="text-xs text-muted tabular">
          + {c} {formatAmount(v)}
        </p>
      ))}
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Card>
  );
}

function RecurringNotice() {
  const n = useLiveQuery(() => db.invoices.where('status').equals('draft').filter((i) => !!i.recurringRuleId).count(), []);
  if (!n) return null;
  return (
    <Card className="mb-6 flex flex-wrap items-center gap-4 border-gold/40 bg-gold-50 px-5 py-4 max-sm:flex-col max-sm:items-start">
      <span className="flex size-10 items-center justify-center rounded-xl bg-white text-gold-700 shadow-card max-sm:hidden">
        <Repeat className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {n} recurring invoice{n === 1 ? ' is' : 's are'} ready to review
        </p>
        <p className="text-sm text-muted">Created as drafts by your schedules. Check them, then issue in one click.</p>
      </div>
      <Button asChild>
        <Link to="/recurring/review">Review &amp; issue</Link>
      </Button>
    </Card>
  );
}
