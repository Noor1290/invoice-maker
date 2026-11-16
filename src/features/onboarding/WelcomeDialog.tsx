import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { completeOnboarding } from '@/db/settingsRepo';
import { requestPersistentStorage } from '@/db/db';
import { sequenceFromExample, upcomingNumbers } from '@/lib/numbering';
import { useLogoUrl } from '@/hooks/useSettings';
import { LogoPicker } from '@/features/settings/LogoPicker';

const EXAMPLES = ['00012', 'PSINV1245', '421', 'INV-2026-0001'];

export function WelcomeDialog({ open }: { open: boolean }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [number, setNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState({
    name: '',
    address: '',
    brn: '',
    vatNo: '',
  });
  const [logo, setLogo] = useState<{ logo?: Blob }>({});
  const logoUrl = useLogoUrl(logo);

  const fmt = useMemo(() => (number.trim() ? sequenceFromExample(number) : null), [number]);
  const preview = fmt ? upcomingNumbers(fmt, 3) : [];
  const error = touched && number.trim() && !fmt ? 'Include at least one digit so we can count up, e.g. INV-001.' : null;

  async function finish(withCompany: boolean) {
    if (!fmt) return;
    setBusy(true);
    try {
      await completeOnboarding({
        firstNumber: number,
        company: withCompany
          ? { name: company.name.trim(), address: company.address.trim(), brn: company.brn.trim(), vatNo: company.vatNo.trim(), ...logo }
          : undefined,
      });
      void requestPersistentStorage();
      toast.success(`You're all set. Your next invoice will be ${preview[0]}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="max-w-xl p-0"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="h-1.5 rounded-t-xl bg-navy" aria-hidden />
        <div className="h-px bg-gold" aria-hidden />
        <div className="p-6 sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gold-700">Step {step} of 2</p>

          {step === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (fmt) setStep(2);
              }}
            >
              <DialogHeader>
                <DialogTitle>Welcome to Invoice Studio</DialogTitle>
                <DialogDescription>
                  Let's start with numbering. After this, every new invoice gets the next number automatically, and
                  no two invoices can ever share a number.
                </DialogDescription>
              </DialogHeader>

              <Field
                htmlFor="first-number"
                label="What's the number of your next invoice?"
                error={error}
                hint="Use any format. Leading zeros are kept."
              >
                <Input
                  id="first-number"
                  autoFocus
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="e.g. PSINV1245"
                  className="h-12 font-medium text-base tracking-wide"
                  aria-invalid={!!error}
                  aria-describedby={error ? 'first-number-error' : 'first-number-hint'}
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Examples:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setNumber(ex)}
                    className="rounded-full border border-line bg-band px-2.5 py-0.5 font-mono text-xs text-ink hover:border-navy/30 hover:bg-navy-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <div
                className="mt-5 rounded-lg border border-line bg-band px-4 py-3.5 text-sm"
                aria-live="polite"
              >
                {preview.length ? (
                  <p className="text-ink">
                    Your next invoices will be:{' '}
                    <span className="font-semibold text-navy">{preview.join(', ')}</span>…
                  </p>
                ) : (
                  <p className="text-muted">Type a number above to see how your invoices will be numbered.</p>
                )}
              </div>

              <DialogFooter>
                <Button type="submit" size="lg" disabled={!fmt}>
                  Continue <ArrowRight />
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void finish(true);
              }}
            >
              <DialogHeader>
                <DialogTitle>Your business details</DialogTitle>
                <DialogDescription>
                  These appear on every invoice. They are stored only in this browser (and in your backups), and you can change them any time in Settings.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4">
                <LogoPicker
                  url={logoUrl}
                  onChange={(blob) => setLogo(blob ? { logo: blob } : {})}
                />
                <Field htmlFor="ob-name" label="Company name">
                  <Input
                    id="ob-name"
                    value={company.name}
                    placeholder="e.g. Acme Trading Ltd"
                    autoComplete="organization"
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  />
                </Field>
                <Field htmlFor="ob-address" label="Address">
                  <Textarea
                    id="ob-address"
                    rows={2}
                    value={company.address}
                    placeholder={'Street, town\nCountry'}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field htmlFor="ob-brn" label="BRN" optional>
                    <Input id="ob-brn" value={company.brn} onChange={(e) => setCompany({ ...company, brn: e.target.value })} placeholder="C12345678" />
                  </Field>
                  <Field htmlFor="ob-vat" label="VAT registration no." optional>
                    <Input id="ob-vat" value={company.vatNo} onChange={(e) => setCompany({ ...company, vatNo: e.target.value })} placeholder="VAT12345678" />
                  </Field>
                </div>
              </div>

              <DialogFooter className="items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" onClick={() => setStep(1)}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button variant="link" disabled={busy} onClick={() => void finish(false)}>
                    Skip, I'll do it later
                  </Button>
                </div>
                <Button type="submit" size="lg" disabled={busy}>
                  <Check /> Save & start
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

