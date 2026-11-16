import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { ActivityPanel, PaymentsPanel } from './PaymentsPanel';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CircleDashed,
  Copy,
  Eye,
  Loader2,
  Lock,
  MoreHorizontal,
  PencilLine,
  Redo2,
  Send,
  Trash2,
  Undo2,
  Download,
  FileMinus,
  FileText,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { DecimalInput } from '@/components/ui/decimal-input';
import { Badge, Callout, Card } from '@/components/ui/misc';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import type { AppSettings, Invoice } from '@/db/types';
import { deleteDraft, issueInvoice, issueProblems, logActivity, nextAvailableNumber, saveDraft, voidInvoice } from '@/db/invoiceRepo';
import { downloadBlob, invoiceFileName } from '@/lib/filename';
import { PrintPortal, printImagesReady } from '@/features/preview/PrintPortal';
import { getTemplateMeasure } from '@/features/preview/InvoicePreview';
import { sellerFromSettings, newLine } from '@/lib/invoiceFactory';
import { describeSkip } from '@/lib/numbering';
import { formatMoney, invoiceTotals, vatRateLabel } from '@/lib/money';
import { amountInWords } from '@/lib/amountInWords';
import { displayStatus, STATUS_META } from '@/lib/status';
import { addDays, cn, formatDate } from '@/lib/utils';
import { useLogoUrl } from '@/hooks/useSettings';
import { useTemplateOptions } from '@/hooks/useTemplateOptions';
import { DocxPreview } from '@/word/DocxPreview';
import { CURRENCIES } from '@/features/settings/DefaultsSettings';
import { InvoicePreview } from '@/features/preview/InvoicePreview';
import { fieldId, invoiceFormSchema, toForm, type InvoiceForm } from './formSchema';
import { NumberField, type NumberStatus } from './NumberField';
import { ClientSection } from './ClientSection';
import { focusField, LineItems } from './LineItems';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string };

const AUTOSAVE_MS = 1500;

function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const isMod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey;

export function InvoiceEditor({ initial, isNew, settings }: { initial: Invoice; isNew: boolean; settings: AppSettings }) {
  const navigate = useNavigate();
  const form = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: toForm(initial),
    mode: 'onTouched',
  });
  const { control, register, setValue, getValues, formState } = form;

  const baseRef = useRef<Invoice>(initial);
  const [status, setStatus] = useState(initial.status);
  const [persisted, setPersisted] = useState(!isNew);
  const locked = status !== 'draft';
  const [liveNumber, setLiveNumber] = useState(initial.number);
  const numberStatus = useRef<NumberStatus>({ blocked: false });
  const userEditedNumber = useRef(false);
  const [save, setSave] = useState<SaveState>(isNew ? { kind: 'idle' } : { kind: 'saved', at: new Date(initial.updatedAt) });
  const touched = useRef(false);
  const discarded = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const { confirm, dialog } = useConfirm();
  const logoUrl = useLogoUrl(settings.company);
  const templateOptions = useTemplateOptions();
  const templateId = useWatch({ control, name: 'templateId' });
  const wordTemplate = templateId?.startsWith('docx-');
  const [wordBusy, setWordBusy] = useState(false);
  // Saved record, live: payments and activity recorded elsewhere show up immediately.
  const live = useLiveQuery(() => (persisted ? db.invoices.get(initial.id) : undefined), [persisted, initial.id]);
  if (live && live.status !== 'draft') baseRef.current = live;
  const isCredit = initial.docType === 'credit_note';
  const docWord = isCredit ? 'credit note' : 'invoice';
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const liveNumberRef = useRef(liveNumber);
  liveNumberRef.current = liveNumber;

  const sequenceId = useWatch({ control, name: 'sequenceId' });
  const issueDate = useWatch({ control, name: 'issueDate' });
  const committedNumber = useWatch({ control, name: 'number' });
  const seq = settings.sequences.find((s) => s.id === sequenceId);
  const docSequences = settings.sequences.filter((s) => s.docType === initial.docType);

  const buildInvoice = useCallback((): Invoice => {
    const v = getValues();
    const b = baseRef.current;
    return {
      ...b,
      ...v,
      client: { ...v.client },
      lines: v.lines.map((l) => ({ ...l })),
      seller: b.status === 'draft' ? sellerFromSettings(settings) : b.seller,
    };
  }, [getValues, settings]);

  // ───────── Saving ─────────
  const saveNow = async (force = false): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (locked || discarded.current) return false;
    if (!touched.current && !force) return true;
    if (numberStatus.current.blocked) {
      setSave({ kind: 'error', message: numberStatus.current.message ?? 'Invoice number is not available.' });
      return false;
    }
    if (inflight.current) await inflight.current;
    touched.current = false;
    setSave({ kind: 'saving' });
    let ok = false;
    const p = (async () => {
      try {
        const res = await saveDraft(buildInvoice(), { skipReason: numberStatus.current.skipReason });
        baseRef.current = res.invoice;
        ok = true;
        setSave({ kind: 'saved', at: new Date() });
        if (res.skipped) toast.info(`${describeSkip(res.skipped)} skipped. Recorded in the numbering log.`);
        if (!persisted) {
          setPersisted(true);
          navigate(`/invoices/${res.invoice.id}`, { replace: true });
        }
      } catch (e) {
        touched.current = true;
        setSave({ kind: 'error', message: (e as Error).message });
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
    return ok;
  };
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;

  // ───────── Undo / redo (form snapshots) ─────────
  const hist = useRef({ past: [] as string[], future: [] as string[], current: JSON.stringify(getValues()) });
  const snapTimer = useRef<number | undefined>(undefined);
  const [, forceRender] = useState(0);
  const recordSnapshot = useCallback(() => {
    window.clearTimeout(snapTimer.current);
    const s = JSON.stringify(getValues());
    const h = hist.current;
    if (s === h.current) return;
    h.past.push(h.current);
    if (h.past.length > 100) h.past.shift();
    h.current = s;
    h.future = [];
    forceRender((n) => n + 1);
  }, [getValues]);
  const applySnapshot = (s: string) => {
    hist.current.current = s;
    form.reset(JSON.parse(s), { keepDefaultValues: true });
    setLiveNumber(getValues('number'));
    forceRender((n) => n + 1);
  };
  const undo = () => {
    if (locked) return;
    recordSnapshot();
    const h = hist.current;
    const prev = h.past.pop();
    if (prev === undefined) return;
    h.future.push(h.current);
    applySnapshot(prev);
  };
  const redo = () => {
    if (locked) return;
    const h = hist.current;
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(h.current);
    applySnapshot(next);
  };
  const undoRef = useRef({ undo, redo });
  undoRef.current = { undo, redo };

  // Any change → schedule autosave + undo snapshot.
  useEffect(() => {
    const sub = form.watch(() => {
      if (discarded.current) return;
      touched.current = true;
      setSave((s) => (s.kind === 'saving' ? s : { kind: 'pending' }));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
      window.clearTimeout(snapTimer.current);
      snapTimer.current = window.setTimeout(recordSnapshot, 400);
    });
    return () => sub.unsubscribe();
  }, [form, recordSnapshot]);

  // Flush on leave.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (touched.current && !discarded.current && !locked) {
        void saveRef.current();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [locked]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (touched.current && !discarded.current) void saveRef.current();
    },
    [],
  );

  // New, unsaved invoice: keep the suggested number in step with the sequence settings.
  useEffect(() => {
    if (persisted || userEditedNumber.current || !seq || seq.mode !== 'auto') return;
    let alive = true;
    void nextAvailableNumber(seq, issueDate || undefined, initial.id).then(({ number }) => {
      if (!alive || number === getValues('number')) return;
      setValue('number', number);
      setLiveNumber(number);
      touched.current = false; // a suggestion is not a user change: don't reserve it yet
      setSave({ kind: 'idle' });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted, seq?.id, seq?.prefix, seq?.suffix, seq?.minDigits, seq?.nextNumber, seq?.mode]);

  // ───────── Lines helpers ─────────
  const addLine = () => {
    if (locked) return;
    const lines = getValues('lines');
    setValue('lines', [...lines, newLine(settings)], { shouldDirty: true });
    requestAnimationFrame(() => focusField(`lines.${lines.length}.description`));
  };

  // ───────── Keyboard shortcuts ─────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isMod(e)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void saveRef.current(true).then((ok) => ok && toast.success('Saved.'));
      } else if (k === 'enter') {
        e.preventDefault();
        addLineRef.current();
      } else if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoRef.current.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        undoRef.current.redo();
      } else if (k === 'p') {
        e.preventDefault();
        void outputRef.current.print();
      } else if (k === 'd') {
        e.preventDefault();
        void outputRef.current.downloadPdf();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const addLineRef = useRef(addLine);
  addLineRef.current = addLine;

  // ───────── Actions ─────────
  const issue = async () => {
    const valid = await form.trigger();
    const inv = buildInvoice();
    const problems = issueProblems(inv);
    if (numberStatus.current.blocked) {
      toast.error(numberStatus.current.message);
      focusField('number');
      return;
    }
    if (!inv.number.trim()) form.setError('number', { message: 'Add an invoice number before issuing.' });
    if (!inv.client.name.trim()) form.setError('client.name', { message: 'Add the client name before issuing.' });
    if (!valid || problems.length) {
      toast.error(problems.length ? problems.join(' ') : 'Please fix the highlighted fields.');
      const first = !inv.number.trim() ? 'number' : !inv.client.name.trim() ? 'client.name' : 'lines.0.description';
      setTab('edit');
      requestAnimationFrame(() => focusField(first));
      return;
    }
    if (!settings.company.vatNo.trim()) {
      const go = await confirm({
        title: 'Your VAT registration number is missing',
        description: 'A VAT invoice should show the seller’s VAT Reg. No. Add it in Settings ▸ Company profile, or issue anyway.',
        confirmLabel: 'Issue anyway',
      });
      if (!go) return;
    }
    const ok = await confirm({
      title: `Issue ${inv.number}?`,
      description: `Issuing locks the ${docWord} number and its content. To change it afterwards you will need to void it${isCredit ? '' : ' or create a credit note'}.`,
      confirmLabel: isCredit ? 'Issue credit note' : 'Issue invoice',
    });
    if (!ok) return;
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    try {
      const res = await issueInvoice(buildInvoice(), { skipReason: numberStatus.current.skipReason });
      baseRef.current = res.invoice;
      touched.current = false;
      setStatus('issued');
      setSave({ kind: 'saved', at: new Date() });
      toast.success(`${res.invoice.number} issued and locked.`);
      if (res.invoice.creditNoteFor) {
        await logActivity(res.invoice.creditNoteFor, { type: 'credit_note', detail: `Credit note ${res.invoice.number} issued` });
      }
      if (!persisted) {
        setPersisted(true);
        navigate(`/invoices/${res.invoice.id}`, { replace: true });
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doVoid = async () => {
    let reason = '';
    const ok = await confirm({
      title: `Void ${baseRef.current.number}?`,
      description: 'The invoice stays in your records marked VOID. Its number is kept permanently and never reused.',
      confirmLabel: 'Void invoice',
      tone: 'danger',
      body: (
        <Field htmlFor="void-reason" label="Reason" optional>
          <Textarea id="void-reason" rows={2} onChange={(e) => (reason = e.target.value)} placeholder="e.g. Raised in error" />
        </Field>
      ),
    });
    if (!ok) return;
    const inv = await voidInvoice(baseRef.current.id, reason);
    baseRef.current = inv;
    setStatus('void');
    toast.success(`${inv.number} voided.`);
  };

  const doDelete = async () => {
    const number = getValues('number').trim();
    if (!persisted) {
      discarded.current = true;
      window.clearTimeout(timer.current);
      navigate('/');
      toast('New invoice discarded. No number was used.');
      return;
    }
    const ok = await confirm({
      title: 'Delete this draft?',
      description: number ? (
        <p>
          <strong>{baseRef.current.number || number}</strong> will be retired: it is never used again and is recorded in the numbering
          log as “Deleted draft”.
        </p>
      ) : (
        'This draft has no number yet.'
      ),
      confirmLabel: 'Delete draft',
      tone: 'danger',
    });
    if (!ok) return;
    discarded.current = true;
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    try {
      await deleteDraft(baseRef.current.id);
      navigate('/');
      toast.success(number ? `Draft deleted. ${baseRef.current.number} is retired.` : 'Draft deleted.');
    } catch (e) {
      discarded.current = false;
      toast.error((e as Error).message);
    }
  };

  // ───────── Output: PDF and print ─────────
  /** Commit the field being edited (e.g. Invoice No. commits on blur) before producing output. */
  const commitActiveField = async () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 0));
  };

  /** Exactly what the preview shows. */
  const outputInvoice = (): Invoice => {
    if (locked) return baseRef.current;
    const inv = buildInvoice();
    return { ...inv, status, number: liveNumberRef.current.trim() || inv.number };
  };

  /** Save the draft first (the document carries its number). Returns the invoice to output, or null. */
  const prepareOutput = async (what: string): Promise<Invoice | null> => {
    await commitActiveField();
    if (!locked) {
      if (numberStatus.current.blocked) {
        toast.error(numberStatus.current.message);
        return null;
      }
      if (!(await saveRef.current(true))) {
        toast.error(`The invoice could not be saved, so no ${what} was created. Check the highlighted fields.`);
        return null;
      }
    }
    return locked ? baseRef.current : buildInvoice();
  };

  const downloadWord = async () => {
    if (wordBusy) return;
    const inv = await prepareOutput('Word file');
    if (!inv) return;
    setWordBusy(true);
    const toastId = toast.loading('Creating Word document…');
    try {
      const { invoiceWordBlob } = await import('@/word/browser');
      const blob = await invoiceWordBlob(inv);
      const name = invoiceFileName(inv.number, inv.client.name, 'docx');
      downloadBlob(blob, name);
      await logActivity(inv.id, { type: 'downloaded', detail: `Word: ${name}` });
      toast.success(`Downloaded ${name}`, { id: toastId });
    } catch (e) {
      toast.error(`Could not create the Word document: ${(e as Error).message}`, { id: toastId });
    } finally {
      setWordBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (pdfBusy) return;
    if (wordTemplate) {
      toast.info('This invoice uses a Word template. In the print window, choose “Save as PDF” as the printer.', { duration: 8000 });
      await print();
      return;
    }
    await commitActiveField();
    if (!locked) {
      if (numberStatus.current.blocked) {
        toast.error(numberStatus.current.message);
        return;
      }
      // Downloading produces a document with this number, so the draft is saved (and its number reserved) first.
      if (!(await saveRef.current(true))) {
        toast.error('The invoice could not be saved, so no PDF was created. Check the highlighted fields.');
        return;
      }
    }
    setPdfBusy(true);
    const toastId = toast.loading('Creating PDF…');
    try {
      const inv = locked ? baseRef.current : buildInvoice();
      const { renderInvoicePdf } = await import('@/pdf/renderPdf');
      const blob = await renderInvoicePdf(inv, logoUrl);
      const name = invoiceFileName(inv.number, inv.client.name, 'pdf');
      downloadBlob(blob, name);
      await logActivity(inv.id, { type: 'downloaded', detail: `PDF: ${name}` });
      toast.success(`Downloaded ${name}`, { id: toastId });
    } catch (e) {
      toast.error(`Could not create the PDF: ${(e as Error).message}`, { id: toastId });
    } finally {
      setPdfBusy(false);
    }
  };

  const print = async () => {
    await commitActiveField();
    await getTemplateMeasure();
    flushSync(() => setPrintInvoice(outputInvoice()));
    await printImagesReady();
    window.print();
  };

  const outputRef = useRef({ print, downloadPdf, outputInvoice });
  outputRef.current = { print, downloadPdf, outputInvoice };
  const printingRef = useRef(false);
  printingRef.current = !!printInvoice;

  // Printing from the browser menu works too: render the print copy just before the dialog opens.
  useEffect(() => {
    const before = () => {
      if (!printingRef.current) flushSync(() => setPrintInvoice(outputRef.current.outputInvoice()));
    };
    const after = () => {
      setPrintInvoice(null);
      if (baseRef.current && persistedRef.current) void logActivity(baseRef.current.id, { type: 'printed' });
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;

  const duplicate = async () => {
    if (!locked && touched.current) await saveNow();
    navigate(`/invoices/new?from=${baseRef.current.id}`);
  };

  // ───────── Preview wiring ─────────
  const onPreviewField = (field: string) => {
    if (field === 'seller' || field === 'seller.bank' || field === 'logo') {
      toast('Your company details and bank details come from Settings.', {
        action: { label: 'Open settings', onClick: () => navigate('/settings/company') },
      });
      return;
    }
    if (field === 'payments') return toast.info('Recording payments arrives in Phase 4.');
    if (field === 'addLine') return addLine();
    const target = field === 'discount' ? 'lines.0.discountPct' : field;
    setTab('edit');
    requestAnimationFrame(() => focusField(target));
  };

  const meta = STATUS_META[displayStatus({ ...baseRef.current, status })];

  return (
    <div className="flex h-full flex-col">
      {dialog}
      {printInvoice && <PrintPortal invoice={printInvoice} logoUrl={logoUrl} />}
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-white px-4 py-2.5 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Invoices
        </Link>
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate font-serif text-xl font-semibold text-navy">
            {liveNumber.trim() || (initial.docType === 'credit_note' ? 'New credit note' : 'New invoice')}
          </h1>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
        <SaveIndicator state={save} locked={locked} persisted={persisted} />
        <div className="ml-auto flex items-center gap-1.5">
          {!locked && (
            <>
              <Button variant="ghost" size="icon" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
                <Undo2 />
              </Button>
              <Button variant="ghost" size="icon" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
                <Redo2 />
              </Button>
              <Button onClick={() => void issue()} className="ml-1">
                <Send /> {isCredit ? 'Issue credit note' : 'Issue invoice'}
              </Button>
            </>
          )}
          <Button variant="outline" size="icon" onClick={() => void print()} aria-label="Print (Ctrl+P)" title="Print (Ctrl+P)">
            <Printer />
          </Button>
          <Button
            variant={locked ? 'primary' : 'outline'}
            onClick={() => void downloadPdf()}
            disabled={pdfBusy}
            title="Download PDF (Ctrl+D)"
          >
            {pdfBusy ? <Loader2 className="animate-spin" /> : <Download />} PDF
          </Button>
          <Button variant="outline" onClick={() => void downloadWord()} disabled={wordBusy} title="Download Word (.docx)">
            {wordBusy ? <Loader2 className="animate-spin" /> : <FileText />} Word
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => void duplicate()} disabled={!persisted}>
                <Copy /> Duplicate invoice
              </MenuItem>
              {status === 'issued' && !isCredit && (
                <MenuItem onSelect={() => navigate(`/invoices/new?creditFor=${baseRef.current.id}`)}>
                  <FileMinus /> Create credit note
                </MenuItem>
              )}
              {status === 'issued' && (
                <MenuItem onSelect={() => void doVoid()} danger>
                  <Ban /> Void invoice…
                </MenuItem>
              )}
              {status === 'draft' && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void doDelete()} danger>
                    <Trash2 /> {persisted ? 'Delete draft…' : 'Discard new invoice'}
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="no-print flex border-b border-line bg-white lg:hidden" role="tablist">
        {(
          [
            ['edit', 'Edit', PencilLine],
            ['preview', 'Preview', Eye],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 text-sm font-medium',
              tab === k ? 'border-navy text-navy' : 'border-transparent text-muted',
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(460px,45%)_1fr]">
        {/* ───────── Form ───────── */}
        <div
          className={cn('min-h-0 min-w-0 overflow-y-auto border-r border-line bg-band', tab !== 'edit' && 'max-lg:hidden')}
          onFocusCapture={(e) => setActiveField((e.target as HTMLElement).closest('[data-field]')?.getAttribute('data-field') ?? null)}
          onBlurCapture={() => setActiveField(null)}
        >
          <form className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6" onSubmit={(e) => e.preventDefault()} noValidate>
            {locked && (
              <Callout tone={status === 'void' ? 'danger' : 'info'} icon={<Lock />}>
                {status === 'void' ? (
                  <>
                    This invoice is <strong>void</strong>
                    {baseRef.current.voidReason ? ` (${baseRef.current.voidReason})` : ''}. Its number is kept permanently.
                  </>
                ) : (
                  <>
                    Issued {baseRef.current.issuedAt ? `on ${formatDate(baseRef.current.issuedAt)}` : ''}. The number and content are
                    locked. To change it, void it{isCredit ? '' : ' or create a credit note'}.
                  </>
                )}
              </Callout>
            )}

            {isCredit && initial.creditNoteFor && <CreditNoteOf id={initial.creditNoteFor} />}
            {locked && live && !isCredit && (
              <Section title="Payments">
                <PaymentsPanel invoice={live} />
              </Section>
            )}

            <Section title={isCredit ? 'Credit note details' : 'Invoice details'}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <NumberField
                    invoiceId={initial.id}
                    value={committedNumber}
                    sequence={seq}
                    issueDate={issueDate}
                    locked={locked}
                    error={formState.errors.number?.message}
                    onLiveChange={(v) => {
                      userEditedNumber.current = true;
                      setLiveNumber(v);
                    }}
                    onCommit={(v) => {
                      form.clearErrors('number');
                      setValue('number', v, { shouldDirty: true });
                    }}
                    onStatus={(s) => (numberStatus.current = s)}
                  />
                </div>
                {docSequences.length > 1 && !locked && (
                  <Field htmlFor={fieldId('sequenceId')} label="Number sequence" className="sm:col-span-2">
                    <NativeSelect
                      id={fieldId('sequenceId')}
                      {...register('sequenceId', {
                        onChange: async (e) => {
                          const s = settings.sequences.find((x) => x.id === e.target.value);
                          if (!s || persisted) return;
                          const { number } = await nextAvailableNumber(s, getValues('issueDate'), initial.id);
                          userEditedNumber.current = false;
                          setValue('number', number);
                          setLiveNumber(number);
                        },
                      })}
                    >
                      {docSequences.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
                <Field htmlFor={fieldId('issueDate')} label="Invoice date" error={formState.errors.issueDate?.message}>
                  <Input
                    id={fieldId('issueDate')}
                    data-field="issueDate"
                    type="date"
                    readOnly={locked}
                    {...register('issueDate', {
                      onChange: (e) => setValue('dueDate', addDays(e.target.value, getValues('termsDays') || 0)),
                    })}
                  />
                </Field>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <Field htmlFor={fieldId('termsDays')} label="Terms (days)" error={formState.errors.termsDays?.message}>
                    <Input
                      id={fieldId('termsDays')}
                      data-field="termsDays"
                      type="number"
                      min={0}
                      max={365}
                      readOnly={locked}
                      {...register('termsDays', {
                        valueAsNumber: true,
                        onChange: (e) => {
                          const n = parseInt(e.target.value, 10);
                          if (Number.isFinite(n) && n >= 0) setValue('dueDate', addDays(getValues('issueDate'), n));
                        },
                      })}
                    />
                  </Field>
                  <Field htmlFor={fieldId('dueDate')} label="Due date" hint="Invoice date + terms">
                    <Input
                      id={fieldId('dueDate')}
                      data-field="dueDate"
                      type="date"
                      readOnly={locked}
                      {...register('dueDate', {
                        onChange: (e) => {
                          const d = daysBetween(getValues('issueDate'), e.target.value);
                          if (Number.isFinite(d) && d >= 0 && d <= 365) setValue('termsDays', d);
                        },
                      })}
                    />
                  </Field>
                </div>
                <Field htmlFor={fieldId('currency')} label="Currency" error={formState.errors.currency?.message}>
                  <Input
                    id={fieldId('currency')}
                    data-field="currency"
                    list="editor-currencies"
                    maxLength={3}
                    className="uppercase"
                    readOnly={locked}
                    {...register('currency', { setValueAs: (v: string) => v.toUpperCase().trim() })}
                  />
                  <datalist id="editor-currencies">
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <Field htmlFor={fieldId('vatRate')} label="VAT rate (%)" error={formState.errors.vatRate?.message}>
                  <Controller
                    control={control}
                    name="vatRate"
                    render={({ field }) => (
                      <DecimalInput
                        ref={field.ref}
                        id={fieldId('vatRate')}
                        data-field="vatRate"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        readOnly={locked}
                        aria-invalid={!!formState.errors.vatRate}
                        className="text-left"
                      />
                    )}
                  />
                </Field>
                <Field htmlFor={fieldId('templateId')} label="Template" className="sm:col-span-2">
                  <NativeSelect id={fieldId('templateId')} data-field="templateId" disabled={locked} {...register('templateId')}>
                    {templateOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </Section>

            <Section title={initial.docType === 'credit_note' ? 'Credit to' : 'Bill to'}>
              <ClientSection form={form} invoiceId={initial.id} locked={locked} isNew={!persisted || isNew} />
            </Section>

            <Section title="Line items">
              <LineItems form={form} settings={settings} locked={locked} />
              <TotalsSummary control={control} />
            </Section>

            <Section title="Notes & terms">
              <Textarea id={fieldId('notes')} data-field="notes" rows={3} readOnly={locked} {...register('notes')} aria-label="Notes and terms" />
            </Section>
            {persisted && (
              <Section title="Activity">
                <ActivityPanel history={live?.history ?? baseRef.current.history} />
              </Section>
            )}
            <p className="pb-6 text-center text-xs text-muted">
              <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">S</kbd> save · <kbd className="kbd">Ctrl</kbd>+
              <kbd className="kbd">Enter</kbd> add line · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Z</kbd> undo
            </p>
          </form>
        </div>

        {/* ───────── Preview ───────── */}
        <PreviewPane
          control={control}
          base={baseRef.current}
          status={status}
          settings={settings}
          liveNumber={liveNumber}
          logoUrl={logoUrl}
          activeField={activeField}
          onField={onPreviewField}
          className={cn(tab !== 'preview' && 'max-lg:hidden')}
        />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-gold-700">{title}</h2>
      {children}
    </Card>
  );
}

function SaveIndicator({ state, locked, persisted }: { state: SaveState; locked: boolean; persisted: boolean }) {
  if (locked)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Lock className="size-3.5" /> Locked
      </span>
    );
  const content =
    state.kind === 'saving' ? (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </>
    ) : state.kind === 'pending' ? (
      <>
        <CircleDashed className="size-3.5" /> Unsaved changes
      </>
    ) : state.kind === 'saved' ? (
      <span className="inline-flex items-center gap-1.5 text-success">
        <Check className="size-3.5" /> Saved
      </span>
    ) : state.kind === 'error' ? (
      <span className="inline-flex items-center gap-1.5 text-danger" title={state.message}>
        <AlertCircle className="size-3.5" /> Not saved: {state.message}
      </span>
    ) : (
      <>{persisted ? '' : 'Not saved yet: start typing and it saves automatically'}</>
    );
  return (
    <span className="inline-flex max-w-md items-center gap-1.5 truncate text-xs text-muted" aria-live="polite">
      {content}
    </span>
  );
}

function TotalsSummary({ control }: { control: Control<InvoiceForm> }) {
  const lines = useWatch({ control, name: 'lines' });
  const currency = useWatch({ control, name: 'currency' });
  const vatRate = useWatch({ control, name: 'vatRate' });
  const t = invoiceTotals(lines, vatRate);
  const row = (label: string, value: string, strong = false) => (
    <div className={cn('flex justify-between gap-4 py-1', strong && 'border-t border-line pt-2 text-base font-semibold text-navy')}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
  return (
    <div className="mt-5 ml-auto w-full max-w-xs text-sm">
      {row('Subtotal', formatMoney(t.subtotal))}
      {t.discount > 0 && row('Discount', formatMoney(-t.discount))}
      {row('Total VAT Exclusive', formatMoney(t.totalVatExclusive))}
      {row(vatRateLabel(t.vatRate), formatMoney(t.vat))}
      {t.notSubjectToVat > 0 && (
        <p className="-mt-0.5 pb-1 text-right text-xs text-muted">Includes {formatMoney(t.notSubjectToVat)} not subject to VAT</p>
      )}
      {row(`Total VAT Inclusive (${currency})`, formatMoney(t.totalVatInclusive, { dashForZero: false }), true)}
      {t.totalVatInclusive > 0 && (
        <p className="mt-1 text-right text-xs italic text-muted">{amountInWords(t.totalVatInclusive, currency || 'MUR')}</p>
      )}
    </div>
  );
}

function PreviewPane({
  control,
  base,
  status,
  settings,
  liveNumber,
  logoUrl,
  activeField,
  onField,
  className,
}: {
  control: Control<InvoiceForm>;
  base: Invoice;
  status: Invoice['status'];
  settings: AppSettings;
  liveNumber: string;
  logoUrl: string | null;
  activeField: string | null;
  onField: (f: string) => void;
  className?: string;
}) {
  const values = useWatch({ control }) as InvoiceForm;
  const deferred = useDeferredValue(values);
  const invoice = useMemo<Invoice>(
    () => ({
      ...base,
      ...deferred,
      status,
      client: { ...base.client, ...deferred.client },
      lines: (deferred.lines ?? []).map((l) => ({ ...newLine(settings), ...l })),
      seller: status === 'draft' ? sellerFromSettings(settings) : base.seller,
    }),
    [base, deferred, status, settings],
  );
  return (
    invoice.templateId.startsWith('docx-') ? (
      <div className={cn('flex min-h-0 min-w-0 flex-col', className)}>
        <div className="no-print flex items-center justify-between border-b border-line bg-white/80 px-4 py-2 text-xs text-muted">
          <span className="font-medium uppercase tracking-wide">Live preview · Word template</span>
          <span>PDF: Print ▸ Save as PDF</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#E6E9EF] p-6">
          <DocxPreview invoice={invoice} fit />
        </div>
      </div>
    ) : (
    <InvoicePreview
      className={cn('min-h-0 min-w-0', className)}
      invoice={invoice}
      logoUrl={logoUrl}
      numberOverride={liveNumber}
      activeField={activeField}
      onFieldClick={onField}
    />
    )
  );
}

function CreditNoteOf({ id }: { id: string }) {
  const original = useLiveQuery(() => db.invoices.get(id), [id]);
  if (!original) return null;
  return (
    <Callout tone="info">
      Credit note for invoice{' '}
      <Link to={`/invoices/${original.id}`} className="font-semibold underline">
        {original.number}
      </Link>{' '}
      to {original.client.name || 'the client'} dated {formatDate(original.issueDate)}. Adjust the lines to the amounts being credited.
    </Callout>
  );
}
