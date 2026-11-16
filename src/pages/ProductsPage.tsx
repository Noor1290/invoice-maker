import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Field } from '@/components/ui/field';
import { Badge, Card } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { db } from '@/db/db';
import type { Product } from '@/db/types';
import { deleteProduct, saveProduct } from '@/db/recordsRepo';
import { formatAmount } from '@/lib/money';
import { uid } from '@/lib/utils';
import { useSettings } from '@/hooks/useSettings';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a name.'),
  description: z.string(),
  unitPrice: z.number({ error: 'Enter a price.' }).min(0, "Price can't be negative."),
  noVat: z.boolean(),
});
type FormValues = z.infer<typeof schema>;
const EMPTY: FormValues = { name: '', description: '', unitPrice: 0, noVat: false };

export function ProductsPage() {
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []);
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const { confirm, dialog } = useConfirm();
  if (!products) return null;
  const cur = settings?.defaults.currency ?? 'MUR';
  const ql = q.trim().toLowerCase();
  const list = products.filter((p) => !ql || `${p.name} ${p.description}`.toLowerCase().includes(ql));

  return (
    <Page>
      {dialog}
      <PageHeader
        title="Products & services"
        description="Type a product's name in an invoice line to fill in its description and price."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> New product
          </Button>
        }
      />
      {products.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy">
            <Package className="size-6" />
          </div>
          <h2 className="text-xl">No products or services yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Save the things you bill often, such as a monthly retainer or an hourly rate.</p>
          <Button className="mt-5" onClick={() => setEditing('new')}>
            <Plus /> Add your first product
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-line p-4">
            <label className="relative block max-w-md">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products and services" className="pl-9" />
            </label>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-band text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Name</th>
                  <th scope="col" className="px-3 py-3 font-medium">Invoice description</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Unit price ({cur})</th>
                  <th scope="col" className="px-3 py-3 font-medium">VAT</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => (
                  <tr key={p.id} className="hover:bg-band/60">
                    <td className="px-5 py-3">
                      <button type="button" className="text-left font-semibold text-navy hover:underline" onClick={() => setEditing(p)}>
                        {p.name}
                      </button>
                    </td>
                    <td className="max-w-md truncate px-3 py-3 text-muted">{p.description || p.name}</td>
                    <td className="px-3 py-3 text-right tabular">{formatAmount(p.unitPrice)}</td>
                    <td className="px-3 py-3">{p.noVat ? <Badge>No VAT</Badge> : <Badge tone="navy">VAT-able</Badge>}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.name}`}
                        onClick={async () => {
                          if (await confirm({ title: `Delete ${p.name}?`, description: 'Existing invoices are not affected.', confirmLabel: 'Delete', tone: 'danger' })) {
                            await deleteProduct(p.id);
                            toast.success(`${p.name} deleted.`);
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted">No products match “{q}”.</p>}
        </Card>
      )}
      <ProductDialog product={editing} onClose={() => setEditing(null)} currency={cur} />
    </Page>
  );
}

export function ProductDialog({
  product,
  onClose,
  currency,
  initial,
}: {
  product: Product | 'new' | null;
  onClose: () => void;
  currency: string;
  initial?: Partial<FormValues>;
}) {
  const editing = product && product !== 'new' ? product : null;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editing ? { name: editing.name, description: editing.description, unitPrice: editing.unitPrice, noVat: editing.noVat } : { ...EMPTY, ...initial },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    await saveProduct({ ...v, id: editing?.id ?? uid(), createdAt: editing?.createdAt });
    toast.success(editing ? 'Product updated.' : `${v.name} saved.`);
    onClose();
  });
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">{editing ? 'Edit product or service' : 'New product or service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <Field htmlFor="p-name" label="Name" error={e.name?.message} hint="What you type to find it in an invoice line">
            <Input id="p-name" autoFocus aria-invalid={!!e.name} {...form.register('name')} />
          </Field>
          <Field htmlFor="p-desc" label="Invoice description" optional hint="Printed on the invoice. Defaults to the name.">
            <Textarea id="p-desc" rows={2} {...form.register('description')} />
          </Field>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field htmlFor="p-price" label={`Unit price (${currency})`} error={e.unitPrice?.message}>
              <Controller
                control={form.control}
                name="unitPrice"
                render={({ field }) => <DecimalInput id="p-price" value={field.value} onValueChange={field.onChange} decimals={2} />}
              />
            </Field>
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-navy" {...form.register('noVat')} />
              No VAT (exempt / zero-rated / disbursement)
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{editing ? 'Save changes' : 'Save product'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
