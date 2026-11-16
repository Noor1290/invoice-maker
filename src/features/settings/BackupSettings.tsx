import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  FileSpreadsheet,
  FolderOpen,
  FolderSync,
  History,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout, Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/misc';
import { db } from '@/db/db';
import type { AppSettings } from '@/db/types';
import { backupFileName, createBackupJson, markBackedUp, parseBackup, type ImportMode } from '@/db/backup';
import { downloadBlob } from '@/lib/filename';
import { invoicesCsv } from '@/lib/csv';
import { todayIso } from '@/lib/utils';
import {
  chooseFolder,
  disableFolderSync,
  folderAccessSupported,
  importBackupQuietly,
  listFolderBackups,
  readFolderBackup,
  reconnectFolder,
  saveAllPdfsNow,
  useFolderStatus,
} from '@/sync/folderSyncBrowser';

export function formatDateTime(iso?: string) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function BackupSettings({ settings }: { settings: AppSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <ManualBackup settings={settings} />
      <FolderAutoSave />
    </div>
  );
}

// ───────────────────────── Manual export / import ─────────────────────────

function ManualBackup({ settings }: { settings: AppSettings }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ text: string; source: string } | null>(null);

  const exportBackup = async () => {
    const json = await createBackupJson();
    downloadBlob(new Blob([json], { type: 'application/json' }), backupFileName());
    await markBackedUp();
    toast.success('Backup downloaded. Keep it somewhere safe, such as a cloud folder.');
  };

  const exportCsv = async () => {
    const invoices = await db.invoices.toArray();
    downloadBlob(new Blob([invoicesCsv(invoices)], { type: 'text/csv;charset=utf-8' }), `invoices-${todayIso()}.csv`);
    toast.success(`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} exported. Opens in Excel.`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data & backup</CardTitle>
        <CardDescription>
          Your invoices are saved in this browser on this computer. Clearing browser data deletes them, so export a backup
          regularly.
        </CardDescription>
      </CardHeader>
      <CardBody className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void exportBackup()}>
            <Download /> Export backup
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload /> Import backup…
          </Button>
          <Button variant="outline" onClick={() => void exportCsv()}>
            <FileSpreadsheet /> Export invoices to Excel/CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) setPending({ text: await f.text(), source: f.name });
            }}
          />
        </div>
        <p className="text-sm text-muted">
          Last backup: <span className="font-medium text-ink">{formatDateTime(settings.lastBackupAt)}</span>. The backup is one
          .json file with everything: invoices, clients, products, settings, numbering, templates and your logo.
        </p>
      </CardBody>
      <ImportDialog pending={pending} onClose={() => setPending(null)} />
    </Card>
  );
}

function ImportDialog({ pending, onClose }: { pending: { text: string; source: string } | null; onClose: () => void }) {
  const [mode, setMode] = useState<ImportMode>('replace');
  const [busy, setBusy] = useState(false);
  let summary: string | null = null;
  let error: string | null = null;
  if (pending) {
    try {
      const b = parseBackup(pending.text);
      const c = b.counts;
      summary = `Made ${formatDateTime(b.exportedAt)}: ${c.invoices ?? 0} invoices, ${c.clients ?? 0} clients, ${c.products ?? 0} products.`;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await importBackupQuietly(pending.text, mode);
      const n = r.added.invoices ?? 0;
      if (r.conflicts.length) {
        toast.warning(`Imported ${n} invoices. Skipped ${r.conflicts.length} whose number already exists here: ${r.conflicts.join(', ')}.`, {
          duration: 12000,
        });
      } else toast.success(mode === 'replace' ? `Backup restored: ${n} invoices. Numbering continues where it left off.` : `Merged: ${n} new invoices added.`);
      onClose();
    } catch (e) {
      toast.error(`Import failed, nothing was changed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-xl">Import backup</DialogTitle>
          <DialogDescription>{pending?.source}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Callout tone="danger" icon={<AlertTriangle />}>
            {error}
          </Callout>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-ink">{summary}</p>
            <Segmented
              name="Import mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'replace', label: 'Restore (replace)' },
                { value: 'merge', label: 'Merge' },
              ]}
              className="self-start"
            />
            {mode === 'replace' ? (
              <Callout tone="warning" icon={<AlertTriangle />}>
                Everything in this browser is replaced by the backup, including the numbering. Use this to recover after
                clearing browser data or on a new computer.
              </Callout>
            ) : (
              <Callout tone="info">
                Invoices, clients and products that aren't here yet are added. An invoice whose number already exists here is
                skipped and listed. Numbering counters keep the higher value, so no number can be used twice.
              </Callout>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} disabled={!!error || busy} onClick={() => void run()}>
            {busy && <Loader2 className="animate-spin" />} {mode === 'replace' ? 'Replace my data' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Auto-save to folder ─────────────────────────

function FolderAutoSave() {
  const folder = useLiveQuery(() => db.local.get('folder'), []);
  const status = useFolderStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [backups, setBackups] = useState<{ name: string; lastModified: number }[] | null>(null);
  const [pending, setPending] = useState<{ text: string; source: string } | null>(null);
  const enabled = !!folder?.enabled;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const err = e as DOMException;
      if (err?.name !== 'AbortError') toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!folderAccessSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-save to a folder</CardTitle>
        </CardHeader>
        <CardBody>
          <Callout tone="info" icon={<FolderSync />}>
            Use <strong>Edge or Chrome on a computer</strong> for automatic folder backup. In this browser, use{' '}
            <strong>Export backup</strong> above; PDFs are saved with the normal download.
          </Callout>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-save to a folder</CardTitle>
        <CardDescription>
          Save every issued invoice as a PDF and keep a backup up to date in a folder on this computer. No sign-in needed.
        </CardDescription>
      </CardHeader>
      <CardBody className="grid gap-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-navy"
            checked={enabled}
            disabled={!!busy}
            onChange={(e) =>
              void act('toggle', async () => {
                if (e.target.checked) {
                  const name = await chooseFolder();
                  toast.success(`Auto-save is on. Saving to “${name}”.`);
                } else {
                  await disableFolderSync();
                  toast('Auto-save is off. Your data stays in this browser; Export backup is still available.');
                }
              })
            }
          />
          <span className="text-sm">
            <span className="font-medium text-ink">Automatically save invoices and backups to a folder on this computer</span>
            <span className="mt-0.5 block text-muted">
              Tip: choose a folder inside <strong>OneDrive</strong> (or Google Drive / Dropbox) so it syncs to the cloud
              automatically.
            </span>
          </span>
        </label>

        {enabled && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-band/60 px-4 py-3">
              <FolderOpen className="size-5 text-navy" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{folder?.folderName}</p>
                <p className="text-xs text-muted">
                  Last saved to folder: <span className="text-ink">{formatDateTime(status.lastSavedAt ?? folder?.lastSavedAt)}</span>
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void act('change', async () => void (await chooseFolder()))}>
                Change folder
              </Button>
            </div>

            <FolderStatusLine state={status.state} message={status.message ?? folder?.lastError} onReconnect={() => void act('reconnect', async () => {
              if (await reconnectFolder()) toast.success('Backup folder reconnected.');
              else toast.error('Permission was not given. Click again to allow saving to the folder.');
            })} />

            <div className="text-xs leading-relaxed text-muted">
              <p>
                <code>Invoices/YYYY-MM/&#123;InvoiceNo&#125;_&#123;Client&#125;.pdf</code>: saved when an invoice is issued, and
                again when a payment is recorded or it is voided.
              </p>
              <p>
                <code>Backups/invoice-studio-backup-latest.json</code> after every change, plus one file per month that is
                kept.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  void act('all', async () => {
                    const n = await saveAllPdfsNow();
                    toast.success(`${n} invoice PDF${n === 1 ? '' : 's'} saved to the folder.`);
                  })
                }
              >
                {busy === 'all' ? <Loader2 className="animate-spin" /> : <Cloud />} Save all PDFs now
              </Button>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => void act('list', async () => setBackups(await listFolderBackups()))}
              >
                <History /> Restore from this folder…
              </Button>
            </div>

            {backups && (
              <div className="rounded-lg border border-line">
                {backups.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">No backups found in the folder's Backups subfolder.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {backups.map((b) => (
                      <li key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-mono text-[13px]">{b.name}</span>
                        <span className="text-xs text-muted">{b.lastModified ? formatDateTime(new Date(b.lastModified).toISOString()) : ''}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void act('read', async () => {
                              const text = await readFolderBackup(b.name);
                              if (text) setPending({ text, source: b.name });
                            })
                          }
                        >
                          Restore…
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardBody>
      <ImportDialog pending={pending} onClose={() => setPending(null)} />
    </Card>
  );
}

function FolderStatusLine({ state, message, onReconnect }: { state: string; message?: string; onReconnect: () => void }) {
  if (state === 'reconnect')
    return (
      <Callout tone="warning" icon={<AlertTriangle />}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>The browser needs your permission again to save to this folder.</span>
          <Button size="sm" onClick={onReconnect}>
            <RefreshCw /> Reconnect folder
          </Button>
        </div>
      </Callout>
    );
  if (state === 'error')
    return (
      <Callout tone="danger" icon={<AlertTriangle />}>
        {message}
      </Callout>
    );
  if (state === 'off') return <p className="text-sm text-muted">Connecting to the folder…</p>;
  if (state === 'pending' || state === 'saving')
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-warning">
        <Loader2 className="size-4 animate-spin" /> {state === 'saving' ? 'Saving…' : 'Changes waiting to be saved (a few seconds)…'}
      </p>
    );
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-success">
      <CheckCircle2 className="size-4" /> Up to date
    </p>
  );
}
