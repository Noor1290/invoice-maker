import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Field } from '@/components/ui/field';
import { Callout } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import type { ActivityEntry, Invoice } from '@/db/types';
import { addPayment, removePayment } from '@/db/invoiceRepo';
import { formatAmount, formatMoney, invoiceTotals } from '@/lib/money';
import { formatDate, todayIso } from '@/lib/utils';

export const PAYMENT_METHODS = ['Bank transfer', 'Cash', 'Cheque', 'Card', 'Mobile payment', 'Other'];

export function PaymentsPanel({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const t = invoiceTotals(invoice.lines, invoice.vatRate, invoice.payments);
  const canPay = invoice.status === 'issued' && invoice.docType === 'invoice';

  return (
    <div className="flex flex-col gap-3">
      {dialog}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Total" value={`${invoice.currency} ${formatAmount(t.totalVatInclusive)}`} />
        <Stat label="Paid" value={formatAmount(t.amountPaid)} />
        <Stat label="Balance due" value={formatAmount(t.balanceDue)} strong={t.balanceDue > 0} />
      </div>
      {invoice.payments.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {invoice.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-muted">{formatDate(p.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                {p.method}
                {p.reference && <span className="text-muted"> · {p.reference}</span>}
              </span>
              <span className="font-medium tabular">{formatAmount(p.amount)}</span>
              {canPay && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove payment of ${formatAmount(p.amount)}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Remove this payment?',
                        description: `${invoice.currency} ${formatAmount(p.amount)} on ${formatDate(p.date)}. The removal is recorded in the activity history.`,
                        confirmLabel: 'Remove payment',
                        tone: 'danger',
                      })
                    ) {
                      await removePayment(invoice.id, p.id);
                      toast.success('Payment removed.');
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canPay && (
        <Button variant={t.balanceDue > 0 ? 'primary' : 'outline'} className="self-start" onClick={() => setOpen(true)}>
          <Plus /> Record payment
        </Button>
      )}
      {invoice.status === 'void' && <p className="text-sm text-muted">Void invoices cannot receive payments.</p>}
      {open && <PaymentDialog invoice={invoice} balance={t.balanceDue} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-band px-3 py-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-semibold tabular ${strong ? 'text-navy' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function PaymentDialog({ invoice, balance, onClose }: { invoice: Invoice; balance: number; onClose: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState(Math.max(0, balance));
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const over = amount - balance > 0.004;

  const save = async () => {
    setBusy(true);
    try {
      await addPayment(invoice.id, { date, amount, method, reference });
      toast.success(`Payment of ${invoice.currency} ${formatAmount(amount)} recorded.`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Record payment</DialogTitle>
          <DialogDescription>
            {invoice.number} · balance due {invoice.currency} {formatMoney(balance, { dashForZero: false })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="pay-date" label="Date received">
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field htmlFor="pay-amount" label={`Amount (${invoice.currency})`}>
              <DecimalInput id="pay-amount" value={amount} onValueChange={setAmount} decimals={2} autoFocus />
            </Field>
            <Field htmlFor="pay-method" label="Method">
              <NativeSelect id="pay-method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor="pay-ref" label="Reference" optional>
              <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. bank ref." />
            </Field>
          </div>
          {over && (
            <Callout tone="warning">
              This is more than the balance due. The invoice will show a negative balance (credit) of{' '}
              {formatAmount(amount - balance)}.
            </Callout>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !(amount > 0) || !date}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ACTIVITY_LABEL: Record<ActivityEntry['type'], string> = {
  created: 'Created',
  updated: 'Updated',
  issued: 'Issued',
  downloaded: 'Downloaded',
  printed: 'Printed',
  paid: 'Payment recorded',
  payment_removed: 'Payment removed',
  voided: 'Voided',
  credit_note: 'Credit note',
  duplicated: 'Duplicated',
};

export function ActivityPanel({ history }: { history: ActivityEntry[] }) {
  if (!history.length) return <p className="text-sm text-muted">Nothing yet.</p>;
  return (
    <ol className="relative flex flex-col gap-3 border-l border-line pl-4">
      {[...history].reverse().map((h, i) => (
        <li key={i} className="text-sm">
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-white bg-navy/60" aria-hidden />
          <p className="font-medium text-ink">
            {ACTIVITY_LABEL[h.type] ?? h.type}
            <span className="ml-2 font-normal text-muted">
              {new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
          {h.detail && <p className="text-muted">{h.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

