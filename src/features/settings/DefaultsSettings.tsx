import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import type { AppSettings } from '@/db/types';
import { updateSettings } from '@/db/settingsRepo';
import { BUILT_IN_TEMPLATES } from '@/templates/registry';

export const CURRENCIES = ['MUR', 'USD', 'EUR', 'GBP', 'ZAR', 'INR', 'AUD', 'CAD', 'CHF', 'AED', 'SGD', 'MGA', 'KES'];

const schema = z.object({
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code, e.g. MUR.')
    .transform((s) => s.toUpperCase()),
  vatRate: z.coerce.number<string>().min(0, 'Must be 0 or more.').max(100, 'Must be 100 or less.'),
  termsDays: z.coerce.number<string>().int('Whole days only.').min(0).max(365, 'At most 365 days.'),
  notes: z.string(),
  templateId: z.string(),
});
type In = z.input<typeof schema>;
type Out = z.output<typeof schema>;

export function DefaultsSettings({ settings }: { settings: AppSettings }) {
  const d = settings.defaults;
  const { register, handleSubmit, formState, reset } = useForm<In, unknown, Out>({
    resolver: zodResolver(schema),
    defaultValues: { ...d, vatRate: String(d.vatRate), termsDays: String(d.termsDays) },
  });
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    await updateSettings((s) => {
      s.defaults = { ...s.defaults, ...values };
    });
    reset({ ...values, vatRate: String(values.vatRate), termsDays: String(values.termsDays) });
    toast.success('Defaults saved. They apply to new invoices.');
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Invoice defaults</CardTitle>
          <CardDescription>Every new invoice starts with these. You can change them on any single invoice.</CardDescription>
        </CardHeader>
        <CardBody className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="currency" label="Default currency" error={e.currency?.message}>
              <Input id="currency" list="currency-list" {...register('currency')} className="uppercase" maxLength={3} aria-invalid={!!e.currency} />
              <datalist id="currency-list">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field htmlFor="vatRate" label="Standard VAT rate (%)" error={e.vatRate?.message}>
              <Input id="vatRate" inputMode="decimal" {...register('vatRate')} aria-invalid={!!e.vatRate} />
            </Field>
            <Field htmlFor="termsDays" label="Payment terms (days)" error={e.termsDays?.message} hint="Due date = invoice date + terms">
              <Input id="termsDays" inputMode="numeric" {...register('termsDays')} aria-invalid={!!e.termsDays} />
            </Field>
          </div>
          <Field htmlFor="templateId" label="Default template">
            <NativeSelect id="templateId" {...register('templateId')}>
              {BUILT_IN_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field htmlFor="notes" label="Default notes & terms">
            <Textarea id="notes" rows={4} {...register('notes')} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={!formState.isDirty || formState.isSubmitting}>
              Save defaults
            </Button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
