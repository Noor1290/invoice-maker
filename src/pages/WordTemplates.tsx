import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCircle2, Copy, Download, Eye, FileText, Info, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Callout, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { db } from '@/db/db';
import type { AppSettings, StoredTemplate } from '@/db/types';
import { downloadBlob } from '@/lib/filename';
import { sampleInvoice } from '@/templates/sample';
import { DOCUMENT_TAGS, ITEM_TAGS } from '@/word/tags';
import type { TemplateInspection } from '@/word/template';
import { DocxPreview } from '@/word/DocxPreview';

const LOOP_SNIPPET = '{#items}{no} {description} {qty} {unit_price} {discount} {amount}{/items}';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${text.length > 40 ? 'the loop' : text}`);
  } catch {
    toast.error('Could not copy. Select the tag and press Ctrl+C.');
  }
}

export function WordTemplates({ settings, onSetDefault }: { settings: AppSettings; onSetDefault: (id: string, name: string) => void }) {
  const templates = useLiveQuery(() => db.templates.where('kind').equals('docx').sortBy('createdAt'), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ name: string; inspection: TemplateInspection; saved: boolean } | null>(null);
  const [preview, setPreview] = useState<StoredTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { addDocxTemplate } = await import('@/word/browser');
      const { template, inspection } = await addDocxTemplate(file);
      setResult({ name: file.name, inspection, saved: !!template });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = async () => {
    const { sampleTemplateBlob } = await import('@/word/browser');
    downloadBlob(await sampleTemplateBlob(), 'invoice-studio-sample-template.docx');
  };

  return (
    <div className="mt-10 flex flex-col gap-6">
      {dialog}
      <Card>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Your Word templates</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Use your own Word (.docx) design: put tags such as <code>{'{invoice_number}'}</code> where the values go, then upload
              it. Invoices download as Word in one click; for a PDF, use <strong>Print ▸ Save as PDF</strong>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void downloadSample()}>
              <Download /> Sample .docx
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload /> Upload .docx
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </div>
        </CardHeader>
        {templates && templates.length > 0 ? (
          <ul className="divide-y divide-line">
            {templates.map((t) => {
              const isDefault = settings.defaults.templateId === t.id;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {t.name} <Badge tone="gold">Word</Badge> {isDefault && <Badge tone="success">Default</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {t.fileName} · {t.tags?.length ?? 0} tags
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(t)}>
                      <Eye /> Preview
                    </Button>
                    {!isDefault && (
                      <Button variant="ghost" size="sm" onClick={() => onSetDefault(t.id, t.name)}>
                        Set as default
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Download ${t.fileName}`} onClick={() => downloadBlob(t.file, t.fileName)}>
                      <Download />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${t.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete ${t.name}?`, confirmLabel: 'Delete template', tone: 'danger' }))) return;
                        try {
                          const { deleteDocxTemplate } = await import('@/word/browser');
                          await deleteDocxTemplate(t.id);
                          toast.success('Template deleted.');
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <CardBody>
            <p className="text-sm text-muted">
              No Word templates yet. Start from the <strong>sample .docx</strong>: it contains every tag and a line-item table that
              repeats for each item.
            </p>
          </CardBody>
        )}
      </Card>

      <TagReference />

      <InspectionDialog result={result} onClose={() => setResult(null)} />
      <TemplatePreviewDialog template={preview} settings={settings} onClose={() => setPreview(null)} />
    </div>
  );
}

function TagReference() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tag reference</CardTitle>
        <CardDescription>
          Type a tag (with its curly braces) in your Word document where the value should appear. Click a tag to copy it.
        </CardDescription>
      </CardHeader>
      <CardBody className="grid gap-6">
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {DOCUMENT_TAGS.map((t) => (
            <TagRow key={t.tag} tag={`{${t.tag}}`} label={t.label} />
          ))}
        </div>
        <div>
          <h3 className="font-sans text-sm font-semibold text-ink">Line items (repeat for each item)</h3>
          <p className="mt-1 text-sm text-muted">
            Put <code>{'{#items}'}</code> at the start and <code>{'{/items}'}</code> at the end of one table row: the row is
            repeated for every line item. Inside the loop you can use:
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {ITEM_TAGS.map((t) => (
              <TagRow key={t.tag} tag={`{${t.tag}}`} label={t.label} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-band px-3 py-2">
            <code className="min-w-0 flex-1 break-all text-[12.5px]">{LOOP_SNIPPET}</code>
            <Button size="sm" variant="outline" onClick={() => void copy(LOOP_SNIPPET)}>
              <Copy /> Copy loop
            </Button>
          </div>
        </div>
        <Callout tone="info" icon={<Info />}>
          Your logo isn't a tag: insert it directly in your Word template. Renamed tags from older versions:{' '}
          <code>{'{total_due}'}</code> is now <code>{'{total_vat_inclusive}'}</code>.
        </Callout>
      </CardBody>
    </Card>
  );
}

function TagRow({ tag, label }: { tag: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void copy(tag)}
      className="group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-band"
      title="Copy"
    >
      <code className="text-[12.5px] font-semibold text-navy">{tag}</code>
      <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <span className="truncate">{label}</span>
        <Copy className="size-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
      </span>
    </button>
  );
}

function InspectionDialog({ result, onClose }: { result: { name: string; inspection: TemplateInspection; saved: boolean } | null; onClose: () => void }) {
  if (!result) return null;
  const r = result.inspection;
  const allGood = result.saved && !r.unknown.length && !r.renamed.length && !r.missing.length;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{result.saved ? 'Template added' : 'This template has errors'}</DialogTitle>
          <DialogDescription>{result.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          {r.errors.length > 0 && (
            <Callout tone="danger" icon={<AlertTriangle />}>
              <p className="font-medium">Fix these in Word, then upload again:</p>
              <ul className="mt-1 list-disc pl-5">
                {r.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </Callout>
          )}
          {result.saved && (
            <div>
              <p className="mb-1.5 font-medium text-ink">
                {r.tags.length + r.itemTags.length} tags found{r.hasItemsLoop ? ', with a line-item loop' : ''}:
              </p>
              <div className="flex flex-wrap gap-1">
                {r.tags.map((t) => (
                  <Badge key={t} tone="navy">{`{${t}}`}</Badge>
                ))}
                {r.itemTags.map((t) => (
                  <Badge key={t} tone="gold">{`items: {${t}}`}</Badge>
                ))}
              </div>
            </div>
          )}
          {r.renamed.length > 0 && (
            <Callout tone="warning" icon={<AlertTriangle />}>
              Renamed tags:{' '}
              {r.renamed.map((x) => (
                <span key={x.from}>
                  <code>{`{${x.from}}`}</code> → <code>{`{${x.to}}`}</code>{' '}
                </span>
              ))}
              . Update them in Word; the old names stay empty.
            </Callout>
          )}
          {r.unknown.length > 0 && (
            <Callout tone="warning" icon={<AlertTriangle />}>
              Unknown tags (they will stay empty): {r.unknown.join(', ')}. Check the spelling against the Tag reference.
            </Callout>
          )}
          {r.missing.length > 0 && result.saved && (
            <Callout tone="info" icon={<Info />}>
              Not in this template (fine if you don't need them): {r.missing.join(', ')}.
            </Callout>
          )}
          {allGood && (
            <Callout tone="success" icon={<CheckCircle2 />}>
              Everything checks out. Choose this template in an invoice, or set it as the default.
            </Callout>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>
            <Check /> OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePreviewDialog({ template, settings, onClose }: { template: StoredTemplate | null; settings: AppSettings; onClose: () => void }) {
  const invoice = useMemo(() => (template ? sampleInvoice(settings, template.id) : null), [template, settings]);
  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      {template && invoice && (
        <DialogContent className="max-w-[900px] bg-[#E6E9EF]">
          <DialogHeader>
            <DialogTitle>{template.name}</DialogTitle>
            <DialogDescription>Filled with sample data.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto" style={{ zoom: 0.85 }}>
            <DocxPreview invoice={invoice} debounceMs={0} />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
