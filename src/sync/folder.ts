import type { Invoice } from '@/db/types';
import { invoiceFileName } from '@/lib/filename';

/**
 * Auto-save to a folder on this computer (File System Access API).
 *
 *   <folder>/Invoices/YYYY-MM/{InvoiceNo}_{ClientName}.pdf      (month = invoice date;
 *                                                                .docx for uploaded Word templates)
 *   <folder>/Backups/invoice-studio-backup-latest.json          (after every change, debounced)
 *   <folder>/Backups/invoice-studio-backup-YYYY-MM.json         (one per month, kept)
 *
 * Existing files are overwritten: invoice numbers are unique, so the newest version wins.
 * The engine only needs the small directory interface below, which the browser's
 * FileSystemDirectoryHandle satisfies (and an in-memory fake does in tests).
 */

export interface WritableLike {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}
export interface FileHandleLike {
  kind: 'file';
  name: string;
  createWritable(): Promise<WritableLike>;
  getFile(): Promise<Blob & { lastModified?: number }>;
}
export interface DirHandleLike {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  values(): AsyncIterable<DirHandleLike | FileHandleLike>;
}

async function dirAt(root: DirHandleLike, parts: string[], create: boolean): Promise<DirHandleLike> {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

export async function writeFileAt(root: DirHandleLike, path: string[], data: Blob | string): Promise<void> {
  const dir = await dirAt(root, path.slice(0, -1), true);
  const fh = await dir.getFileHandle(path[path.length - 1], { create: true });
  const w = await fh.createWritable(); // replaces the file's contents
  await w.write(data);
  await w.close();
}

export async function readTextAt(root: DirHandleLike, path: string[]): Promise<string | null> {
  try {
    const dir = await dirAt(root, path.slice(0, -1), false);
    const fh = await dir.getFileHandle(path[path.length - 1]);
    return await (await fh.getFile()).text();
  } catch {
    return null;
  }
}

export async function listFiles(root: DirHandleLike, path: string[]): Promise<{ name: string; lastModified: number }[]> {
  try {
    const dir = await dirAt(root, path, false);
    const out: { name: string; lastModified: number }[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') out.push({ name: entry.name, lastModified: (await entry.getFile()).lastModified ?? 0 });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

export const INVOICES_DIR = 'Invoices';
export const BACKUPS_DIR = 'Backups';
export const LATEST_BACKUP = 'invoice-studio-backup-latest.json';

export function invoicePdfPath(inv: Pick<Invoice, 'issueDate' | 'number' | 'client'>, ext: 'pdf' | 'docx' = 'pdf'): string[] {
  return [INVOICES_DIR, (inv.issueDate || '0000-00').slice(0, 7), invoiceFileName(inv.number, inv.client.name, ext)];
}

export interface RenderedDocument {
  data: Blob;
  ext: 'pdf' | 'docx';
}

export function monthlyBackupName(now: Date): string {
  return `invoice-studio-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.json`;
}

// ───────────────────────── Engine ─────────────────────────

export type FolderState = 'off' | 'ok' | 'pending' | 'saving' | 'reconnect' | 'error';

export interface FolderStatus {
  state: FolderState;
  lastSavedAt?: string;
  message?: string;
}

export interface EngineOptions {
  /** The folder, 'reconnect' if permission must be granted again, or null when auto-save is off. */
  getRoot: () => Promise<DirHandleLike | 'reconnect' | null>;
  loadInvoice: (id: string) => Promise<Invoice | undefined>;
  /** PDF for built-in templates; the filled .docx for uploaded Word templates. */
  renderDocument: (inv: Invoice) => Promise<RenderedDocument>;
  exportBackup: () => Promise<string>;
  onSaved?: (at: string) => void | Promise<void>;
  onError?: (message: string) => void | Promise<void>;
  backupDelayMs?: number;
  pdfDelayMs?: number;
  now?: () => Date;
}

export class FolderSyncEngine {
  private pdfQueue = new Set<string>();
  private backupDue = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private status: FolderStatus = { state: 'off' };
  private listeners = new Set<() => void>();
  private suppressed = 0;

  constructor(private o: EngineOptions) {}

  // status store (useSyncExternalStore)
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;
  setStatus(s: FolderStatus) {
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  /** Ignore change notifications while `fn` runs (e.g. a bulk import queues one backup afterwards instead). */
  async quietly<T>(fn: () => Promise<T>): Promise<T> {
    this.suppressed++;
    try {
      return await fn();
    } finally {
      this.suppressed--;
    }
  }

  queuePdf(invoiceId: string) {
    if (this.suppressed) return;
    this.pdfQueue.add(invoiceId);
    this.backupDue = true;
    this.schedule(this.o.pdfDelayMs ?? 800);
  }

  queueBackup() {
    if (this.suppressed) return;
    this.backupDue = true;
    this.schedule(this.o.backupDelayMs ?? 10_000);
  }

  get hasPending() {
    return this.backupDue || this.pdfQueue.size > 0;
  }

  private schedule(ms: number) {
    if (this.status.state === 'ok' || this.status.state === 'off') this.setStatus({ ...this.status, state: this.status.state === 'off' ? 'off' : 'pending' });
    // A PDF should not wait for the 10-second backup debounce; a backup always waits for quiet.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.pdfQueue.size ? Math.min(ms, this.o.pdfDelayMs ?? 800) : ms);
  }

  dispose() {
    clearTimeout(this.timer);
  }

  /** Write everything that is queued now. Safe to call repeatedly. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.hasPending) return this.flush();
      return;
    }
    this.running = this.run();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  private async run() {
    const root = await this.o.getRoot();
    if (root === null) {
      this.setStatus({ ...this.status, state: 'off' });
      return;
    }
    if (root === 'reconnect') {
      this.setStatus({ ...this.status, state: 'reconnect', message: 'Click to reconnect your backup folder.' });
      return; // keep the queue; it is written after reconnecting
    }
    if (!this.hasPending) {
      this.setStatus({ ...this.status, state: 'ok' });
      return;
    }
    this.setStatus({ ...this.status, state: 'saving' });
    try {
      const ids = [...this.pdfQueue];
      for (const id of ids) {
        const inv = await this.o.loadInvoice(id);
        if (inv && inv.status !== 'draft') {
          const doc = await this.o.renderDocument(inv);
          await writeFileAt(root, invoicePdfPath(inv, doc.ext), doc.data);
        }
        this.pdfQueue.delete(id);
      }
      if (this.backupDue) {
        this.backupDue = false;
        const json = await this.o.exportBackup();
        const now = (this.o.now ?? (() => new Date()))();
        await writeFileAt(root, [BACKUPS_DIR, LATEST_BACKUP], json);
        await writeFileAt(root, [BACKUPS_DIR, monthlyBackupName(now)], json);
      }
      const at = (this.o.now ?? (() => new Date()))().toISOString();
      await this.o.onSaved?.(at);
      this.setStatus({ state: this.hasPending ? 'pending' : 'ok', lastSavedAt: at });
    } catch (e) {
      const err = e as DOMException;
      const needsPermission = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      const message = needsPermission
        ? 'Click to reconnect your backup folder.'
        : err?.name === 'NotFoundError'
          ? 'The backup folder was moved or deleted. Choose it again in Settings.'
          : `Could not save to the folder: ${err?.message ?? String(e)}`;
      this.backupDue = true; // retry later
      await this.o.onError?.(message);
      this.setStatus({ ...this.status, state: needsPermission ? 'reconnect' : 'error', message });
    }
  }

  /** "Save all PDFs now": every non-draft invoice into its month folder. */
  async saveAll(invoices: Invoice[]): Promise<number> {
    let n = 0;
    for (const inv of invoices) {
      if (inv.status === 'draft') continue;
      this.pdfQueue.add(inv.id);
      n++;
    }
    this.backupDue = true;
    await this.flush();
    if (this.status.state !== 'ok') throw new Error(this.status.message ?? 'Could not save to the folder.');
    return n;
  }
}
