import { db, upgradeInvoiceRecord, upgradeProductRecord } from './db';
import type { AppSettings, Invoice, NumberingLogEntry, NumberSequence } from './types';
import { nowIso } from '@/lib/utils';

/**
 * Full backup: one JSON file with every table (invoices, clients, products,
 * settings incl. numbering, numbering log, retired numbers, templates and the logo).
 * Blobs (logo, uploaded template files) are embedded as base64.
 * The device-local `local` table (auto-save folder connection) is never included.
 */

export const BACKUP_APP = 'invoice-studio';
export const BACKUP_FORMAT = 1;

const TABLES = ['settings', 'invoices', 'clients', 'products', 'templates', 'numberingLog', 'recurring', 'retiredNumbers'] as const;
type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  counts: Partial<Record<TableName, number>>;
  tables: Partial<Record<TableName, unknown[]>>;
}

// ───────────────────────── Blob <-> JSON ─────────────────────────

interface EncodedBlob {
  __blob: true;
  type: string;
  base64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return { __blob: true, type: value.type, base64: bytesToBase64(new Uint8Array(await value.arrayBuffer())) } satisfies EncodedBlob;
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = await encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o.__blob === true && typeof o.base64 === 'string') return new Blob([base64ToBytes(o.base64)], { type: String(o.type ?? '') });
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = decode(v);
    return out;
  }
  return value;
}

// ───────────────────────── Export ─────────────────────────

export async function createBackup(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {};
  const counts: BackupFile['counts'] = {};
  for (const name of TABLES) {
    const rows = await db.table(name).toArray();
    tables[name] = (await encode(rows)) as unknown[];
    counts[name] = rows.length;
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: nowIso(), counts, tables };
}

export async function createBackupJson(): Promise<string> {
  return JSON.stringify(await createBackup());
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `invoice-studio-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Remember when the last backup was made (drives the 30-day reminder). */
export async function markBackedUp(at = nowIso()) {
  await db.settings.where('key').equals('app').modify((s) => {
    s.lastBackupAt = at;
  });
}

// ───────────────────────── Import ─────────────────────────

export type ImportMode = 'replace' | 'merge';

export interface ImportReport {
  mode: ImportMode;
  exportedAt: string;
  added: Partial<Record<TableName, number>>;
  /** Invoices not imported because their number already exists here (merge only). */
  conflicts: string[];
}

export class BackupFormatError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'BackupFormatError';
  }
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupFormatError('This file is not a valid backup (it is not JSON).');
  }
  const b = data as Partial<BackupFile>;
  if (!b || b.app !== BACKUP_APP || typeof b.format !== 'number' || !b.tables) {
    throw new BackupFormatError('This file is not an Invoice Studio backup.');
  }
  if (b.format > BACKUP_FORMAT) throw new BackupFormatError('This backup was made by a newer version of the app. Update the app first.');
  return b as BackupFile;
}

function rowsOf<T>(b: BackupFile, name: TableName): T[] {
  const rows = (decode(b.tables[name] ?? []) as Record<string, unknown>[]).map((r) => {
    if (name === 'invoices') upgradeInvoiceRecord(r);
    if (name === 'products') upgradeProductRecord(r);
    return r;
  });
  return rows as T[];
}

const logKey = (e: NumberingLogEntry) => `${e.at}|${e.type}|${e.from ?? ''}|${e.to ?? ''}|${e.detail ?? ''}`;

/**
 * Restore a backup.
 * - replace: this browser's data is replaced by the backup (numbering included).
 * - merge:   records missing here are added; invoices whose number already exists here are
 *            skipped and reported; each numbering counter keeps the higher of the two values.
 */
export async function importBackup(text: string, mode: ImportMode): Promise<ImportReport> {
  const b = parseBackup(text);
  const report: ImportReport = { mode, exportedAt: b.exportedAt, added: {}, conflicts: [] };
  const data = Object.fromEntries(TABLES.map((t) => [t, rowsOf<Record<string, unknown>>(b, t)])) as Record<TableName, Record<string, unknown>[]>;

  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') {
      for (const t of TABLES) {
        await db.table(t).clear();
        if (data[t].length) await db.table(t).bulkPut(data[t]);
        report.added[t] = data[t].length;
      }
      return;
    }

    // ── merge ──
    const add = (t: TableName) => (report.added[t] = (report.added[t] ?? 0) + 1);

    for (const inv of data.invoices as unknown as Invoice[]) {
      const sameId = await db.invoices.get(inv.id);
      if (sameId) continue; // already here
      if (inv.normalizedNumber) {
        const clash = await db.invoices.where('normalizedNumber').equals(inv.normalizedNumber).first();
        const retired = await db.retiredNumbers.get(inv.normalizedNumber);
        if (clash || retired) {
          report.conflicts.push(inv.number);
          continue;
        }
      }
      await db.invoices.add(inv);
      add('invoices');
    }
    for (const t of ['clients', 'products', 'templates', 'recurring'] as const) {
      for (const r of data[t]) {
        if (await db.table(t).get(r.id as string)) continue;
        await db.table(t).add(r);
        add(t);
      }
    }
    for (const r of data.retiredNumbers) {
      if (await db.retiredNumbers.get(r.normalizedNumber as string)) continue;
      await db.retiredNumbers.add(r as never);
      add('retiredNumbers');
    }
    const existingLog = new Set((await db.numberingLog.toArray()).map(logKey));
    for (const r of data.numberingLog as unknown as NumberingLogEntry[]) {
      if (existingLog.has(logKey(r))) continue;
      const { id: _id, ...rest } = r;
      void _id;
      await db.numberingLog.add(rest);
      add('numberingLog');
    }
    // Settings: keep this browser's profile, but never let a counter go backwards.
    const incoming = data.settings.find((s) => s.key === 'app') as AppSettings | undefined;
    const current = await db.settings.get('app');
    if (incoming && !current) {
      await db.settings.put(incoming);
      add('settings');
    } else if (incoming && current) {
      const seqs: NumberSequence[] = current.sequences.map((s) => {
        const other = incoming.sequences.find((o) => o.id === s.id);
        return other && other.prefix === s.prefix && other.suffix === s.suffix
          ? { ...s, nextNumber: Math.max(s.nextNumber, other.nextNumber) }
          : s;
      });
      for (const o of incoming.sequences) if (!seqs.some((s) => s.id === o.id)) seqs.push(o);
      await db.settings.put({ ...current, sequences: seqs, updatedAt: nowIso() });
    }
  });

  if (report.conflicts.length || mode === 'merge') {
    await db.numberingLog.add({
      at: nowIso(),
      sequenceId: '',
      type: 'import',
      detail:
        `Backup from ${b.exportedAt.slice(0, 10)} ${mode === 'replace' ? 'restored' : 'merged'}` +
        (report.conflicts.length ? `; skipped existing numbers: ${report.conflicts.join(', ')}` : ''),
    });
  }
  return report;
}

// ───────────────────────── CSV export (opens in Excel) ─────────────────────────

export function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
