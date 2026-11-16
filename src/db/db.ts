import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Client,
  Invoice,
  NumberingLogEntry,
  Product,
  RecurringRule,
  RetiredNumber,
  FolderSyncState,
  StoredTemplate,
} from './types';

/**
 * Every site under <username>.github.io shares one browser origin, so the
 * database name must be unique to this app.
 */
export const DB_NAME = 'invoice-studio-db';

export class AppDB extends Dexie {
  settings!: EntityTable<AppSettings, 'key'>;
  invoices!: EntityTable<Invoice, 'id'>;
  clients!: EntityTable<Client, 'id'>;
  products!: EntityTable<Product, 'id'>;
  templates!: EntityTable<StoredTemplate, 'id'>;
  numberingLog!: EntityTable<NumberingLogEntry, 'id'>;
  recurring!: EntityTable<RecurringRule, 'id'>;
  retiredNumbers!: EntityTable<RetiredNumber, 'normalizedNumber'>;
  local!: EntityTable<FolderSyncState, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      settings: 'key',
      // &normalizedNumber → UNIQUE index: two invoices can never share a number.
      invoices: 'id, &normalizedNumber, looseKey, status, sequenceId, clientId, issueDate, dueDate, updatedAt',
      clients: 'id, name',
      products: 'id, name',
      templates: 'id, kind, createdAt',
      numberingLog: '++id, at, sequenceId, type',
      recurring: 'id, nextRunDate, active',
    });
    // v2: numbers of deleted drafts are retired permanently.
    this.version(2).stores({
      retiredNumbers: 'normalizedNumber, sequenceId, at',
    });
    // v3: one VAT rate per invoice + a "No VAT" flag per line (replaces per-line VAT codes).
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table('invoices').toCollection().modify(upgradeInvoiceRecord);
        await tx.table('products').toCollection().modify(upgradeProductRecord);
      });
    // v4: device-local state (auto-save folder handle). Not part of backups.
    this.version(4).stores({ local: 'key' });
    // v5: recurring schedules (status index) and drafts linked to their schedule.
    this.version(5).stores({
      recurring: 'id, nextRunDate, status, sourceInvoiceId',
      invoices: 'id, &normalizedNumber, looseKey, status, sequenceId, clientId, issueDate, dueDate, updatedAt, recurringRuleId',
    });
  }
}

// ───────────────────────── Record upgrades (shared with the legacy-database import) ─────────────────────────

type AnyRecord = Record<string, unknown>;
type OldLine = AnyRecord & { vatCode?: string; vatRate?: number; noVat?: boolean };

export const BUILT_IN_TEMPLATE_IDS = ['classic', 'minimal', 'compact'];

const isNoVat = (l: OldLine) => l.vatCode === 'zero' || l.vatCode === 'exempt' || Number(l.vatRate ?? 0) === 0;

/** Bring an invoice record from any earlier version up to date (in place). */
export function upgradeInvoiceRecord(inv: AnyRecord & { lines?: OldLine[]; vatRate?: number; templateId?: string }) {
  const lines = inv.lines ?? [];
  if (typeof inv.vatRate !== 'number') {
    const std = lines.find((l) => !isNoVat(l));
    inv.vatRate = Number(std?.vatRate ?? 15);
  }
  inv.lines = lines.map((l) => {
    const { vatCode: _c, vatRate: _r, ...rest } = l;
    void _c;
    void _r;
    return { ...rest, noVat: typeof l.noVat === 'boolean' ? l.noVat : isNoVat(l) };
  });
}

export function upgradeProductRecord(p: OldLine) {
  if (typeof p.noVat !== 'boolean') p.noVat = isNoVat(p);
  delete p.vatCode;
  delete p.vatRate;
}

export const db = new AppDB();

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}
