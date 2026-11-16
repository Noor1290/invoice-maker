import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppDB } from './db';
import { importLegacyDatabase } from './legacyImport';

async function makeLegacy(name: string, withData = true) {
  await Dexie.delete(name);
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
  if (withData) {
    await old.table('settings').put({ key: 'app', onboarded: true, company: { name: 'Acme Ltd' }, defaults: { templateId: 'old-template-id' }, sequences: [] });
    await old.table('invoices').add({
      id: 'a',
      number: 'INV-0001',
      normalizedNumber: 'inv-0001',
      templateId: 'old-template-id',
      lines: [
        { id: '1', description: 'Fees', qty: 1, unitPrice: 100, discountPct: 0, vatCode: 'standard', vatRate: 15 },
        { id: '2', description: 'Stamp duty', qty: 1, unitPrice: 50, discountPct: 0, vatCode: 'exempt', vatRate: 0 },
      ],
    });
    await old.table('clients').add({ id: 'c', name: 'Client Co' });
    await old.table('numberingLog').add({ at: '2026-11-16T10:00:00Z', sequenceId: 's', type: 'skip', detail: 'gap' });
    await old.table('retiredNumbers').add({ normalizedNumber: 'inv-0002', number: 'INV-0002', sequenceId: 's', at: 'x', reason: 'Deleted draft' });
  }
  old.close();
}

describe('renamed database: data from the previous database is carried over', () => {
  it('copies every table, upgrading old records', async () => {
    await makeLegacy('acme-invoice-db');
    await Dexie.delete('new-db-1');
    const target = new AppDB('new-db-1');

    expect(await importLegacyDatabase(target)).toBe('acme-invoice-db');

    expect((await target.settings.get('app'))?.company.name).toBe('Acme Ltd');
    expect((await target.settings.get('app'))?.defaults.templateId).toBe('classic');
    const inv = (await target.invoices.get('a'))!;
    expect(inv.templateId).toBe('classic');
    expect(inv.vatRate).toBe(15);
    expect(inv.lines.map((l) => l.noVat)).toEqual([false, true]);
    expect(await target.clients.count()).toBe(1);
    expect(await target.numberingLog.count()).toBe(1);
    expect((await target.retiredNumbers.get('inv-0002'))?.reason).toBe('Deleted draft');

    // Second start: the new database has data, nothing is imported again.
    expect(await importLegacyDatabase(target)).toBeNull();
    target.close();
    await Dexie.delete('acme-invoice-db');
  });

  it('ignores unrelated or empty databases', async () => {
    await makeLegacy('empty-invoice-db', false);
    await Dexie.delete('other-db');
    const other = new Dexie('other-db');
    other.version(1).stores({ notes: 'id' });
    await other.open();
    other.close();
    await Dexie.delete('new-db-2');
    const target = new AppDB('new-db-2');
    expect(await importLegacyDatabase(target)).toBeNull();
    expect(await target.invoices.count()).toBe(0);
    target.close();
  });
});
