import { useEffect, useRef, useState } from 'react';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { CopyPlus, UserCheck, UserPlus } from 'lucide-react';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/misc';
import type { Client, Invoice } from '@/db/types';
import { createClientFromParty, latestInvoiceForClient, partyFromClient, searchClients } from '@/db/recordsRepo';
import { formatDate, uid } from '@/lib/utils';
import { fieldId, type InvoiceForm } from './formSchema';

interface Props {
  form: UseFormReturn<InvoiceForm>;
  invoiceId: string;
  locked: boolean;
  isNew: boolean;
}

export function ClientSection({ form, invoiceId, locked, isNew }: Props) {
  const { control, register, setValue, getValues, formState } = form;
  const clientId = useWatch({ control, name: 'client.clientId' });
  const name = useWatch({ control, name: 'client.name' });
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const fetchClients = useRef((q: string) => searchClients(q)).current;
  const e = formState.errors.client;

  // Offer "create from last invoice" when a saved client is picked on a fresh invoice.
  useEffect(() => {
    let alive = true;
    const emptyLines = getValues('lines').every((l) => !l.description.trim() && !l.unitPrice);
    if (!clientId || !isNew || !emptyLines || locked) {
      setLastInvoice(null);
      return;
    }
    void latestInvoiceForClient(clientId, invoiceId).then((inv) => alive && setLastInvoice(inv ?? null));
    return () => {
      alive = false;
    };
  }, [clientId, isNew, invoiceId, locked, getValues]);

  const pick = (c: Client) => {
    const party = partyFromClient(c);
    for (const [k, v] of Object.entries(party)) setValue(`client.${k as keyof typeof party}`, v ?? '', { shouldDirty: true });
    setValue('client.clientId', c.id, { shouldDirty: true });
    requestAnimationFrame(() => document.getElementById(fieldId('lines.0.description'))?.focus());
  };

  const saveAsClient = async () => {
    const party = getValues('client');
    if (!party.name.trim()) return toast.error('Type the client name first.');
    const c = await createClientFromParty(party);
    setValue('client.clientId', c.id, { shouldDirty: true });
    toast.success(`${c.name} saved as a client.`);
  };

  const copyLines = () => {
    if (!lastInvoice) return;
    setValue(
      'lines',
      lastInvoice.lines.map((l) => ({ ...l, id: uid(), noVat: !!l.noVat })),
      { shouldDirty: true },
    );
    setValue('notes', lastInvoice.notes, { shouldDirty: true });
    setLastInvoice(null);
    toast.success(`Line items copied from ${lastInvoice.number}.`);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={fieldId('client.name')} className="text-[13px] font-medium text-ink">
            Client name
          </label>
          {clientId ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <UserCheck className="size-3.5" /> Saved client
            </span>
          ) : (
            !locked &&
            name.trim() && (
              <button
                type="button"
                onClick={() => void saveAsClient()}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-navy hover:bg-navy-50"
              >
                <UserPlus className="size-3.5" /> Save as new client
              </button>
            )
          )}
        </div>
        <Controller
          control={control}
          name="client.name"
          render={({ field }) => (
            <Autocomplete<Client>
              ref={field.ref}
              id={fieldId('client.name')}
              data-field="client.name"
              placeholder="Start typing to search your clients"
              value={field.value}
              readOnly={locked}
              aria-invalid={!!e?.name}
              onValueChange={(v) => {
                field.onChange(v);
                if (getValues('client.clientId')) setValue('client.clientId', undefined, { shouldDirty: true });
              }}
              onBlur={field.onBlur}
              fetchItems={fetchClients}
              itemKey={(c) => c.id}
              renderItem={(c) => (
                <div>
                  <p className="font-medium text-ink">{c.name}</p>
                  {(c.vatNo || c.address) && (
                    <p className="truncate text-xs text-muted">{[c.vatNo && `VAT ${c.vatNo}`, c.address.split('\n')[0]].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
              )}
              onSelectItem={pick}
              footer={
                field.value.trim()
                  ? {
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <UserPlus className="size-4" /> New client “{field.value.trim()}”
                        </span>
                      ),
                      onSelect: () => {
                        void saveAsClient();
                        requestAnimationFrame(() => document.getElementById(fieldId('client.address'))?.focus());
                      },
                    }
                  : null
              }
            />
          )}
        />
        {e?.name && (
          <p role="alert" className="text-[12.5px] text-danger">
            {e.name.message}
          </p>
        )}
      </div>

      {lastInvoice && (
        <Callout tone="info" icon={<CopyPlus />}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Monthly retainer? Copy the lines from <strong>{lastInvoice.number}</strong> ({formatDate(lastInvoice.issueDate)}).
            </span>
            <Button size="sm" variant="outline" onClick={copyLines}>
              Copy lines
            </Button>
          </div>
        </Callout>
      )}

      <Field htmlFor={fieldId('client.address')} label="Address">
        <Textarea id={fieldId('client.address')} data-field="client.address" rows={2} readOnly={locked} {...register('client.address')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={fieldId('client.brn')} label="BRN" optional>
          <Input id={fieldId('client.brn')} data-field="client.brn" readOnly={locked} {...register('client.brn')} />
        </Field>
        <Field htmlFor={fieldId('client.vatNo')} label="VAT Reg. No." optional>
          <Input id={fieldId('client.vatNo')} data-field="client.vatNo" readOnly={locked} {...register('client.vatNo')} />
        </Field>
        <Field htmlFor={fieldId('client.attention')} label="Attention" optional>
          <Input id={fieldId('client.attention')} data-field="client.attention" readOnly={locked} placeholder="e.g. Accounts Payable" {...register('client.attention')} />
        </Field>
        <Field htmlFor={fieldId('client.email')} label="Email" optional error={e?.email?.message}>
          <Input id={fieldId('client.email')} data-field="client.email" type="email" readOnly={locked} aria-invalid={!!e?.email} {...register('client.email')} />
        </Field>
      </div>
    </div>
  );
}
