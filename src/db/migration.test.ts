import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppDB } from './db';

describe('v3 migration: per-line VAT codes → one VAT rate per invoice + "No VAT" flag', () => {
  it('converts existing invoices and products', async () => {
    const name = 'v3-migration-test';
    await Dexie.delete(name);
    // A database as Phase 2 left it (schema v2, old line format).
    const old = new Dexie(name);
    old.version(1).stores({
      settings: 'key',
      invoices: 'id, &normalizedNumber, looseKey, status, sequenceId, clientId, issueDate, dueDate, updatedAt',
      clients: 'id, name',
      products: 'id, name',
      templates: 'id, kind, createdAt',
      numberingLog: '++id, at, sequenceId, type',
      recurring: 'id, nextRunDate, active',
    });
    old.version(2).stores({ retiredNumbers: 'normalizedNumber, sequenceId, at' });
    await old.table('invoices').add({
      id: 'a',
      number: 'PSINV1245',
      normalizedNumber: 'psinv1245',
      lines: [
        { id: '1', description: 'Fees', qty: 1, unitPrice: 100, discountPct: 0, vatCode: 'standard', vatRate: 15 },
        { id: '2', description: 'Disbursement', qty: 1, unitPrice: 50, discountPct: 0, vatCode: 'zero', vatRate: 0 },
      ],
    });
    await old.table('products').add({ id: 'p', name: 'Stamp duty', unitPrice: 10, vatCode: 'exempt', vatRate: 0 });
    old.close();

    const db = new AppDB(name);
    const inv = (await db.invoices.get('a'))!;
    expect(inv.vatRate).toBe(15);
    expect(inv.lines.map((l) => l.noVat)).toEqual([false, true]);
    expect(inv.lines[0]).not.toHaveProperty('vatCode');
    const p = (await db.products.get('p'))!;
    expect(p.noVat).toBe(true);
    expect(p).not.toHaveProperty('vatRate');
    db.close();
  });
});
