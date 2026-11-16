import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import type { AppSettings } from '@/db/types';
import { updateSettings } from '@/db/settingsRepo';
import { useLogoUrl } from '@/hooks/useSettings';
import { LogoPicker } from './LogoPicker';

const schema = z.object({
  name: z.string().trim().min(1, 'Company name is required.'),
  tagline: z.string(),
  address: z.string(),
  brn: z.string(),
  vatNo: z.string(),
  phone: z.string(),
  email: z.union([z.literal(''), z.email('Enter a valid email address.')]),
  website: z.string(),
  bank: z.object({
    bankName: z.string(),
    accountName: z.string(),
    accountNo: z.string(),
    iban: z.string(),
    swift: z.string(),
  }),
});
type FormValues = z.infer<typeof schema>;

function toForm(s: AppSettings): FormValues {
  const { name, tagline, address, brn, vatNo, phone, email, website, bank } = s.company;
  return { name, tagline, address, brn, vatNo, phone, email, website, bank: { ...bank } };
}

export function CompanySettings({ settings }: { settings: AppSettings }) {
  const logoUrl = useLogoUrl(settings.company);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toForm(settings) });
  const { register, handleSubmit, formState, reset } = form;
  const e = formState.errors;

  useEffect(() => {
    if (!formState.isDirty) reset(toForm(settings));
    // only re-sync when settings change underneath a pristine form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.updatedAt]);

  const onSubmit = handleSubmit(async (values) => {
    await updateSettings((s) => {
      s.company = { ...s.company, ...values, bank: { ...values.bank } };
    });
    reset(values);
    toast.success('Company profile saved. New invoices will use these details.');
  });

  const inv = (k: string) => ({ 'aria-invalid': !!k, 'aria-describedby': k ? `${k}-error` : undefined });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Company profile</CardTitle>
          <CardDescription>Shown in the FROM block and footer of every invoice.</CardDescription>
        </CardHeader>
        <CardBody className="grid gap-5">
          <LogoPicker
            url={logoUrl}
            onChange={(blob) =>
              void updateSettings((s) => {
                s.company.logo = blob ?? undefined;
                delete s.company.hideLogo;
              }).then(() => toast.success(blob ? 'Logo updated.' : 'Logo removed.'))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="name" label="Company name" error={e.name?.message}>
              <Input id="name" {...register('name')} {...inv(e.name ? 'name' : '')} />
            </Field>
            <Field htmlFor="tagline" label="Tagline" optional>
              <Input id="tagline" {...register('tagline')} placeholder="e.g. Consulting | Design | Support" />
            </Field>
          </div>
          <Field htmlFor="address" label="Address">
            <Textarea id="address" rows={3} {...register('address')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="brn" label="BRN" hint="Business Registration Number">
              <Input id="brn" {...register('brn')} />
            </Field>
            <Field htmlFor="vatNo" label="VAT registration no." hint="Required on VAT invoices">
              <Input id="vatNo" {...register('vatNo')} />
            </Field>
            <Field htmlFor="phone" label="Phone">
              <Input id="phone" type="tel" {...register('phone')} />
            </Field>
            <Field htmlFor="email" label="Email" error={e.email?.message}>
              <Input id="email" type="email" {...register('email')} {...inv(e.email ? 'email' : '')} />
            </Field>
            <Field htmlFor="website" label="Website" className="sm:col-span-2">
              <Input id="website" {...register('website')} placeholder="www.example.com" />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
          <CardDescription>Printed under Payment Details, with the invoice number as the payment reference.</CardDescription>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field htmlFor="bankName" label="Bank">
            <Input id="bankName" {...register('bank.bankName')} />
          </Field>
          <Field htmlFor="accountName" label="Account name">
            <Input id="accountName" {...register('bank.accountName')} />
          </Field>
          <Field htmlFor="accountNo" label="Account no.">
            <Input id="accountNo" {...register('bank.accountNo')} />
          </Field>
          <Field htmlFor="iban" label="IBAN">
            <Input id="iban" {...register('bank.iban')} />
          </Field>
          <Field htmlFor="swift" label="SWIFT / BIC">
            <Input id="swift" {...register('bank.swift')} />
          </Field>
        </CardBody>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" disabled={!formState.isDirty || formState.isSubmitting} className="shadow-pop">
          Save company profile
        </Button>
      </div>
    </form>
  );
}
