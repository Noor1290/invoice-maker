import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CheckCircle2, Circle, Keyboard, Lightbulb, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/misc';
import { db } from '@/db/db';
import { updateSettings } from '@/db/settingsRepo';
import { cn } from '@/lib/utils';

export interface GuideStep {
  id: string;
  title: string;
  text: string;
  to: string;
  action: string;
  done: boolean;
  optional?: boolean;
}

/** The getting-started checklist; each step ticks itself off from the data. */
export function useGuideSteps(): GuideStep[] | undefined {
  return useLiveQuery(async () => {
    const [settings, invoices, clients, products, folder, recurring, templates] = await Promise.all([
      db.settings.get('app'),
      db.invoices.toArray(),
      db.clients.count(),
      db.products.count(),
      db.local.get('folder'),
      db.recurring.count(),
      db.templates.count(),
    ]);
    const c = settings?.company;
    return [
      {
        id: 'company',
        title: 'Add your business details and logo',
        text: 'Your name, address, BRN, VAT Reg. No. and bank details appear on every invoice. Upload your logo and pick your colours.',
        to: '/settings/company',
        action: 'Company profile',
        done: !!(c?.name.trim() && c.vatNo.trim() && c.address.trim()),
      },
      {
        id: 'numbering',
        title: 'Check your invoice numbering',
        text: 'Each new invoice gets the next number automatically and a number can never be used twice. You can change the format or jump ahead here.',
        to: '/settings/numbering',
        action: 'Numbering',
        done: !!settings?.onboarded,
      },
      {
        id: 'records',
        title: 'Save your clients and services',
        text: 'Saved clients and products fill in invoices for you as you type.',
        to: '/clients',
        action: 'Clients',
        done: clients > 0 || products > 0,
      },
      {
        id: 'issue',
        title: 'Create and issue your first invoice',
        text: 'Fill in the form; the A4 preview updates as you type. Issuing locks the number and content.',
        to: '/invoices/new',
        action: 'New invoice',
        done: invoices.some((i) => i.status !== 'draft'),
      },
      {
        id: 'send',
        title: 'Download it as PDF or Word, or print it',
        text: 'Use the PDF, Word and print buttons at the top of the editor (Ctrl+D, Ctrl+P).',
        to: invoices.find((i) => i.status !== 'draft') ? `/invoices/${invoices.find((i) => i.status !== 'draft')!.id}` : '/invoices/new',
        action: 'Open invoice',
        done: invoices.some((i) => i.history.some((h) => h.type === 'downloaded' || h.type === 'printed')),
      },
      {
        id: 'backup',
        title: 'Keep a backup',
        text: 'Your data lives in this browser only. Turn on automatic saving to a (OneDrive) folder, or export a backup regularly.',
        to: '/settings/backup',
        action: 'Data & backup',
        done: !!settings?.lastBackupAt || !!folder?.enabled,
      },
      {
        id: 'recurring',
        title: 'Optional: repeat monthly invoices',
        text: 'On an issued invoice choose More ▸ Repeat this invoice. Drafts are created for you to review and issue.',
        to: '/recurring',
        action: 'Recurring',
        done: recurring > 0,
        optional: true,
      },
      {
        id: 'word',
        title: 'Optional: use your own Word design',
        text: 'Add tags such as {invoice_number} to your own .docx and upload it under Templates.',
        to: '/templates',
        action: 'Templates',
        done: templates > 0,
        optional: true,
      },
    ];
  }, []);
}

/** Compact progress card for the dashboard (hidden once dismissed or complete). */
export function GuideCard() {
  const steps = useGuideSteps();
  const dismissed = useLiveQuery(async () => !!(await db.settings.get('app'))?.guideDismissed, []);
  if (!steps || dismissed !== false) return null;
  const core = steps.filter((s) => !s.optional);
  const done = core.filter((s) => s.done).length;
  if (done === core.length) return null;
  const next = core.find((s) => !s.done)!;
  return (
    <Card className="mb-6 px-5 py-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            Getting started · {done} of {core.length} done
          </p>
          <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-band" role="progressbar" aria-valuemin={0} aria-valuemax={core.length} aria-valuenow={done} aria-label="Getting started progress">
            <div className="h-full rounded-full bg-gold" style={{ width: `${(done / core.length) * 100}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            Next: <span className="text-ink">{next.title}</span>
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={next.to}>
            {next.action} <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to="/guide">See all steps</Link>
        </Button>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-band hover:text-ink"
          aria-label="Hide the getting started card"
          onClick={() =>
            void updateSettings((s) => {
              s.guideDismissed = true;
            })
          }
        >
          <X className="size-4" />
        </button>
      </div>
    </Card>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl + S', 'Save now (drafts also save automatically)'],
  ['Ctrl + Enter', 'Add a line item'],
  ['Enter', 'Next line (adds one on the last line)'],
  ['Ctrl + Backspace', 'Delete the current line'],
  ['Alt + ↑ / ↓', 'Move a line up or down'],
  ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'],
  ['Ctrl + D', 'Download PDF'],
  ['Ctrl + P', 'Print'],
];

const TIPS = [
  'Click anything in the preview to jump to its field; the field you are editing is highlighted in the preview.',
  'Type a client’s name to fill in all their details; choose “New client” to save a new one without leaving the invoice.',
  'Tick “No VAT” on exempt or zero-rated lines (e.g. disbursements). The VAT rate for the whole invoice is under Invoice details.',
  'Issued invoices are locked. To correct one, void it or create a credit note (More menu).',
  'Deleted drafts keep their number retired, so numbers are never reused.',
  'On Mac, use Cmd instead of Ctrl.',
];

export function GuidePage() {
  const steps = useGuideSteps();
  if (!steps) return null;
  return (
    <Page className="max-w-4xl">
      <PageHeader title="Getting started" description="A few minutes to set everything up. Steps tick themselves off as you go." />
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Card className={cn('flex flex-wrap items-start gap-4 px-5 py-4', s.done && 'bg-white/70')}>
              {s.done ? (
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-6 shrink-0 text-line" aria-label="Not done yet" />
              )}
              <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-2.5rem)]">
                <h2 className={cn('font-sans text-base font-semibold', s.done ? 'text-muted' : 'text-ink')}>
                  {i + 1}. {s.title}
                </h2>
                <p className="mt-0.5 text-sm text-muted">{s.text}</p>
              </div>
              <Button asChild variant={s.done ? 'ghost' : 'outline'} size="sm" className="max-sm:ml-10">
                <Link to={s.to}>
                  {s.action} <ArrowRight />
                </Link>
              </Button>
            </Card>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Keyboard className="size-5 text-gold-700" /> Keyboard shortcuts
            </CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid gap-2 text-sm">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt>
                    <kbd className="kbd">{k}</kbd>
                  </dt>
                  <dd className="text-right text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="size-5 text-gold-700" /> Good to know
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="grid list-disc gap-2 pl-5 text-sm text-ink">
              {TIPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </Page>
  );
}
