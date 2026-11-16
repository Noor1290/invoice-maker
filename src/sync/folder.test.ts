import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { completeOnboarding, getSettings } from '@/db/settingsRepo';
import { addPayment, issueInvoice, nextAvailableNumber, saveDraft, voidInvoice } from '@/db/invoiceRepo';
import { createBackupJson, importBackup } from '@/db/backup';
import { newInvoice } from '@/lib/invoiceFactory';
import { invoiceTotals } from '@/lib/money';
import { formatNext } from '@/lib/numbering';
import { BACKUPS_DIR, FolderSyncEngine, LATEST_BACKUP, listFiles, readTextAt, type DirHandleLike, type FileHandleLike } from './folder';
import { attachChangeHooks } from './hooks';
import type { Invoice } from '@/db/types';

// ───────── In-memory folder with the File System Access API shape ─────────
class MemFile implements FileHandleLike {
  kind = 'file' as const;
  data: Blob = new Blob([]);
  lastModified = 0;
  writes = 0;
  constructor(public name: string) {}
  async createWritable() {
    const parts: (Blob | string)[] = [];
    return {
      write: async (d: Blob | string) => void parts.push(d),
      close: async () => {
        this.data = new Blob(parts);
        this.lastModified = Date.now();
        this.writes++;
      },
    };
  }
  async getFile() {
    return Object.assign(this.data, { lastModified: this.lastModified });
  }
}
class MemDir implements DirHandleLike {
  kind = 'directory' as const;
  dirs = new Map<string, MemDir>();
  files = new Map<string, MemFile>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    if (!this.dirs.has(name)) {
      if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      this.dirs.set(name, new MemDir(name));
    }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!o?.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      this.files.set(name, new MemFile(name));
    }
    return this.files.get(name)!;
  }
  async *values() {
    yield* this.dirs.values();
    yield* this.files.values();
  }
}

// The PDF content here is a stand-in that records what was rendered (real PDF output is tested in pdf.test.tsx).
const fakePdf = async (inv: Invoice) => {
  const t = invoiceTotals(inv.lines, inv.vatRate, inv.payments);
  const ext = inv.templateId.startsWith('docx-') ? ('docx' as const) : ('pdf' as const);
  return { ext, data: new Blob([`${ext.toUpperCase()} ${inv.number} status=${inv.status} balance=${t.balanceDue.toFixed(2)}`]) };
};

let root: MemDir;
let engine: FolderSyncEngine;
let detach: () => void;
let now = new Date('2026-11-16T20:45:00');

beforeEach(async () => {
  await db.delete();
  await db.open();
  root = new MemDir('OneDrive/Invoices');
  now = new Date('2026-11-16T20:45:00');
  engine = new FolderSyncEngine({
    getRoot: async () => root,
    loadInvoice: (id) => db.invoices.get(id),
    renderDocument: fakePdf,
    exportBackup: createBackupJson,
    now: () => now,
  });
  detach = attachChangeHooks(db, engine);
  await completeOnboarding({ firstNumber: 'PSINV1245' });
});
afterEach(() => {
  detach();
  engine.dispose();
});

async function issue(client = 'ABC Ltd', issueDate = '2026-11-16') {
  const s = await getSettings();
  const seq = s.sequences[0];
  const inv = newInvoice(s, seq, (await nextAvailableNumber(seq)).number);
  inv.issueDate = issueDate;
  inv.client.name = client;
  inv.lines[0] = { ...inv.lines[0], description: 'Fees', unitPrice: 1000 };
  return (await issueInvoice(inv)).invoice;
}
const read = async (...path: string[]) => readTextAt(root, path);

describe('auto-save to folder', () => {
  it('issuing saves the PDF into the invoice-date month folder', async () => {
    await issue('ABC Ltd', '2026-10-31');
    await engine.flush();
    expect(await read('Invoices', '2026-10', 'PSINV1245_ABC Ltd.pdf')).toBe('PDF PSINV1245 status=issued balance=1150.00');
    expect(engine.getStatus().state).toBe('ok');
    expect(engine.getStatus().lastSavedAt).toBe(now.toISOString());
  });

  it('invoices on an uploaded Word template are saved as .docx', async () => {
    const s = await getSettings();
    const seq = s.sequences[0];
    const inv = newInvoice(s, seq, (await nextAvailableNumber(seq)).number);
    inv.client.name = 'ABC Ltd';
    inv.templateId = 'docx-1234';
    inv.lines[0] = { ...inv.lines[0], description: 'Fees', unitPrice: 1000 };
    await issueInvoice(inv);
    await engine.flush();
    expect(await read('Invoices', inv.issueDate.slice(0, 7), 'PSINV1245_ABC Ltd.docx')).toContain('DOCX PSINV1245');
  });

  it('drafts are not saved as PDFs', async () => {
    const s = await getSettings();
    await saveDraft(newInvoice(s, s.sequences[0], 'PSINV1245'));
    await engine.flush();
    expect(await listFiles(root, ['Invoices', '2026-11'])).toHaveLength(0);
  });

  it('recording a payment (and voiding) overwrites the same PDF', async () => {
    const inv = await issue();
    await engine.flush();
    await addPayment(inv.id, { date: '2026-11-20', amount: 150, method: 'Bank transfer' });
    await engine.flush();
    const file = root.dirs.get('Invoices')!.dirs.get('2026-11')!.files.get('PSINV1245_ABC Ltd.pdf')!;
    expect(await read('Invoices', '2026-11', 'PSINV1245_ABC Ltd.pdf')).toBe('PDF PSINV1245 status=issued balance=1000.00');
    expect(file.writes).toBe(2);
    await voidInvoice(inv.id, 'error');
    await engine.flush();
    expect(await read('Invoices', '2026-11', 'PSINV1245_ABC Ltd.pdf')).toContain('status=void');
    expect(root.dirs.get('Invoices')!.dirs.get('2026-11')!.files.size).toBe(1); // overwritten, not duplicated
  });

  it('the latest backup is updated after every change, and a monthly file is kept', async () => {
    await engine.flush();
    const first = JSON.parse((await read(BACKUPS_DIR, LATEST_BACKUP))!);
    expect(first.counts.invoices).toBe(0);

    await issue();
    await engine.flush();
    const second = JSON.parse((await read(BACKUPS_DIR, LATEST_BACKUP))!);
    expect(second.counts.invoices).toBe(1);
    expect(await read(BACKUPS_DIR, 'invoice-studio-backup-2026-11.json')).toBe(await read(BACKUPS_DIR, LATEST_BACKUP));

    // Next month: a new monthly file; November's file is kept.
    now = new Date('2026-12-02T09:00:00');
    await issue('XYZ Ltd', '2026-12-02');
    await engine.flush();
    const names = (await listFiles(root, [BACKUPS_DIR])).map((f) => f.name);
    expect(names).toEqual(['invoice-studio-backup-latest.json', 'invoice-studio-backup-2026-12.json', 'invoice-studio-backup-2026-11.json']);
    expect(JSON.parse((await read(BACKUPS_DIR, 'invoice-studio-backup-2026-11.json'))!).counts.invoices).toBe(1);
    expect(JSON.parse((await read(BACKUPS_DIR, LATEST_BACKUP))!).counts.invoices).toBe(2);
  });

  it('changes are debounced into one backup', async () => {
    const e2 = new FolderSyncEngine({
      getRoot: async () => root,
      loadInvoice: (id) => db.invoices.get(id),
      renderDocument: fakePdf,
      exportBackup: createBackupJson,
      backupDelayMs: 50,
    });
    e2.queueBackup();
    e2.queueBackup();
    e2.queueBackup();
    expect(e2.getStatus().state).toBe('off');
    await new Promise((r) => setTimeout(r, 120));
    const f = root.dirs.get(BACKUPS_DIR)!.files.get(LATEST_BACKUP)!;
    expect(f.writes).toBe(1);
    e2.dispose();
  });

  it('restoring from the folder backup brings everything back with numbering intact', async () => {
    const a = await issue();
    await addPayment(a.id, { date: '2026-11-20', amount: 1150, method: 'Cash' });
    await issue('XYZ Ltd');
    await engine.flush();
    const json = (await read(BACKUPS_DIR, LATEST_BACKUP))!;

    // Lose everything (e.g. browser data cleared)…
    detach();
    await db.delete();
    await db.open();
    expect(await db.invoices.count()).toBe(0);

    // …and restore from the folder.
    const report = await importBackup(json, 'replace');
    expect(report.added.invoices).toBe(2);
    const restored = await db.invoices.toArray();
    expect(restored.map((i) => i.number).sort()).toEqual(['PSINV1245', 'PSINV1246']);
    expect(restored.find((i) => i.number === 'PSINV1245')!.payments).toHaveLength(1);
    const seq = (await getSettings()).sequences[0];
    expect(formatNext(seq)).toBe('PSINV1247');
    expect((await nextAvailableNumber(seq)).number).toBe('PSINV1247');
  });

  it('asks to reconnect (never fails silently) and keeps the queue', async () => {
    let allowed = false;
    const e2 = new FolderSyncEngine({
      getRoot: async () => (allowed ? root : 'reconnect'),
      loadInvoice: (id) => db.invoices.get(id),
      renderDocument: fakePdf,
      exportBackup: createBackupJson,
    });
    e2.queueBackup();
    await e2.flush();
    expect(e2.getStatus().state).toBe('reconnect');
    expect(e2.hasPending).toBe(true);
    allowed = true;
    await e2.flush();
    expect(e2.getStatus().state).toBe('ok');
    e2.dispose();
  });

  it('"Save all PDFs now" exports every non-draft invoice', async () => {
    await issue('A Ltd', '2026-10-05');
    await issue('B Ltd', '2026-11-05');
    const s = await getSettings();
    await saveDraft(newInvoice(s, s.sequences[0], 'PSINV9999'));
    root = new MemDir('fresh');
    const n = await engine.saveAll(await db.invoices.toArray());
    expect(n).toBe(2);
    expect(await read('Invoices', '2026-10', 'PSINV1245_A Ltd.pdf')).toContain('PSINV1245');
    expect(await read('Invoices', '2026-11', 'PSINV1246_B Ltd.pdf')).toContain('PSINV1246');
  });
});
