import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FilePlus2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { db } from '@/db/db';
import type { Client } from '@/db/types';
import { deleteClient, saveClient } from '@/db/recordsRepo';
import { invoiceTotals, formatAmount } from '@/lib/money';
import { formatDate, uid } from '@/lib/utils';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the client name.'),
  address: z.string(),
  brn: z.string(),
  vatNo: z.string(),
  attention: z.string(),
  email: z.union([z.literal(''), z.email('Enter a valid email address.')]),
  phone: z.string(),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { name: '', address: '', brn: '', vatNo: '', attention: '', email: '', phone: '' };

export function ClientsPage() {
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []);
  const invoices = useLiveQuery(() => db.invoices.toArray(), []);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; last: string; balance: number; currency: string }>();
    for (const inv of invoices ?? []) {
      if (!inv.clientId) continue;
      const s = m.get(inv.clientId) ?? { count: 0, last: '', balance: 0, currency: inv.currency };
      s.count++;
      if (inv.issueDate > s.last) s.last = inv.issueDate;
      if (inv.status === 'issued' && inv.docType === 'invoice') s.balance += invoiceTotals(inv.lines, inv.vatRate, inv.payments).balanceDue;
      m.set(inv.clientId, s);
    }
    return m;
  }, [invoices]);

  if (!clients) return null;
  const ql = q.trim().toLowerCase();
  const list = clients.filter((c) => !ql || `${c.name} ${c.vatNo} ${c.brn} ${c.email}`.toLowerCase().includes(ql));

  return (
    <Page>
      {dialog}
      <PageHeader
        title="Clients"
        description="Saved clients fill in the Bill To details on new invoices."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New client
          </Button>
        }
      />
      {clients.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy">
            <Users className="size-6" />
          </div>
          <h2 className="text-xl">No clients yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Add clients here, or save them straight from the invoice editor.</p>
          <Button className="mt-5" onClick={() => setEditing('new')}>
            <Plus /> Add your first client
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <label className="relative block max-w-md">
              <span className="sr-only">Search clients</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, VAT no. or email" className="pl-9" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Client</th>
                  <th scope="col" className="px-3 py-3 font-medium">VAT Reg. No.</th>
                  <th scope="col" className="px-3 py-3 font-medium">Invoices</th>
                  <th scope="col" className="px-3 py-3 font-medium">Last invoice</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Outstanding</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const s = stats.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-band/60">
                      <td className="px-5 py-3">
                        <button type="button" className="text-left font-semibold text-navy hover:underline" onClick={() => setEditing(c)}>
                          {c.name}
                        </button>
                        {c.email && <p className="text-xs text-muted">{c.email}</p>}
                      </td>
                      <td className="px-3 py-3 text-muted">{c.vatNo || '-'}</td>
                      <td className="px-3 py-3 tabular">{s?.count ?? 0}</td>
                      <td className="px-3 py-3 text-muted">{s?.last ? formatDate(s.last) : '-'}</td>
                      <td className="px-3 py-3 text-right tabular">{s?.balance ? `${s.currency} ${formatAmount(s.balance)}` : '-'}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/invoices/new?client=${c.id}`)} title="New invoice for this client">
                          <FilePlus2 /> Invoice
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${c.name}`}
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete ${c.name}?`,
                              description: 'The client is removed from your saved clients. Existing invoices keep their copy of the client details.',
                              confirmLabel: 'Delete client',
                              tone: 'danger',
                            });
                            if (ok) {
                              await deleteClient(c.id);
                              toast.success(`${c.name} deleted.`);
                            }
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted">No clients match “{q}”.</p>}
        </Card>
      )}
      <ClientDialog client={editing} onClose={() => setEditing(null)} />
      <p className="mt-6 text-center text-xs text-muted">
        Tip: type a new name in the invoice editor's client field and choose “New client” to save it without leaving the page.{' '}
        <Link to="/invoices/new" className="underline">
          New invoice
        </Link>
      </p>
    </Page>
  );
}

function ClientDialog({ client, onClose }: { client: Client | 'new' | null; onClose: () => void }) {
  const editing = client && client !== 'new' ? client : null;
  const form = useForm<FormValues>({ resolver: zodResolver(schema), values: editing ? { ...EMPTY, ...editing } : EMPTY });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    await saveClient({ ...v, id: editing?.id ?? uid(), createdAt: editing?.createdAt });
    toast.success(editing ? 'Client updated.' : `${v.name} added.`);
    onClose();
  });
  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{editing ? 'Edit client' : 'New client'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field htmlFor="c-name" label="Client name" error={e.name?.message}>
            <Input id="c-name" autoFocus aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field htmlFor="c-address" label="Address">
            <Textarea id="c-address" rows={2} {...form.register('address')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="c-brn" label="BRN" optional>
              <Input id="c-brn" {...form.register('brn')} />
            </Field>
            <Field htmlFor="c-vat" label="VAT Reg. No." optional>
              <Input id="c-vat" {...form.register('vatNo')} />
            </Field>
            <Field htmlFor="c-attn" label="Attention" optional>
              <Input id="c-attn" placeholder="e.g. Accounts Payable" {...form.register('attention')} />
            </Field>
            <Field htmlFor="c-phone" label="Phone" optional>
              <Input id="c-phone" type="tel" {...form.register('phone')} />
            </Field>
            <Field htmlFor="c-email" label="Email" optional error={e.email?.message} className="sm:col-span-2">
              <Input id="c-email" type="email" aria-invalid={!!e.email} {...form.register('email')} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{editing ? 'Save changes' : 'Add client'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
