import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Eye } from 'lucide-react';
import { WordTemplates } from './WordTemplates';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLogoUrl, useSettings } from '@/hooks/useSettings';
import { updateSettings } from '@/db/settingsRepo';
import { BUILT_IN_TEMPLATES } from '@/templates/registry';
import { sampleInvoice } from '@/templates/sample';
import { A4 } from '@/templates/primitives';
import { InvoicePages, useTemplateMeasure } from '@/features/preview/InvoicePreview';

const PAGE_PX = (A4.width * 4) / 3;

export function TemplatesPage() {
  const settings = useSettings();
  const measure = useTemplateMeasure();
  const logoUrl = useLogoUrl(settings?.company);
  const [preview, setPreview] = useState<string | null>(null);
  const samples = useMemo(
    () => (settings ? Object.fromEntries(BUILT_IN_TEMPLATES.map((t) => [t.id, sampleInvoice(settings, t.id)])) : {}),
    [settings],
  );
  if (!settings) return null;

  const setDefault = async (id: string, name: string) => {
    await updateSettings((s) => {
      s.defaults.templateId = id;
    });
    toast.success(`${name} is now the default template for new invoices.`);
  };

  return (
    <Page>
      <PageHeader title="Templates" description="Choose how your invoices look. The default is used for every new invoice." />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BUILT_IN_TEMPLATES.map((t) => {
          const isDefault = settings.defaults.templateId === t.id;
          return (
            <Card key={t.id} className="flex flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => setPreview(t.id)}
                className="group relative block h-[300px] overflow-hidden border-b border-line bg-[#E6E9EF]"
              >
                <span className="sr-only">{`Preview ${t.name}`}</span>
                {measure && (
                  <div aria-hidden className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 shadow-card" style={{ zoom: 0.36, width: PAGE_PX }}>
                    <InvoicePages invoice={samples[t.id]} logoUrl={logoUrl} measure={measure} logoPlaceholder />
                  </div>
                )}
                <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-navy/0 opacity-0 transition group-hover:bg-navy/10 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-navy shadow-pop">
                    <Eye className="size-4" /> Preview
                  </span>
                </span>
              </button>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-lg text-navy">{t.name}</h2>
                  <Badge tone="navy">Built-in</Badge>
                  {isDefault && <Badge tone="success">Default</Badge>}
                </div>
                <p className="flex-1 text-sm text-muted">{t.description}</p>
                <Button variant={isDefault ? 'outline' : 'primary'} disabled={isDefault} onClick={() => void setDefault(t.id, t.name)}>
                  {isDefault ? (
                    <>
                      <Check /> Default template
                    </>
                  ) : (
                    'Set as default'
                  )}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <WordTemplates settings={settings} onSetDefault={setDefault} />

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && measure && (
          <DialogContent className="max-w-[860px] bg-[#E6E9EF] p-6">
            <DialogHeader>
              <DialogTitle>{BUILT_IN_TEMPLATES.find((t) => t.id === preview)?.name}</DialogTitle>
              <DialogDescription>Shown with sample data and your company details.</DialogDescription>
            </DialogHeader>
            <div className="mx-auto" style={{ zoom: 0.95, width: PAGE_PX }}>
              <InvoicePages invoice={samples[preview]} logoUrl={logoUrl} measure={measure} logoPlaceholder />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Page>
  );
}
