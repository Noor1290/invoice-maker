import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completeOnboarding, getSettings, saveSequence, updateSettings } from './settingsRepo';
import { checkNumber, deleteDraft, issueInvoice, nextAvailableNumber, saveDraft } from './invoiceRepo';
import { BackupFormatError, createBackupJson, importBackup, parseBackup } from './backup';
import { newInvoice } from '@/lib/invoiceFactory';
import { invoicesCsv } from '@/lib/csv';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await completeOnboarding({ firstNumber: 'PSINV1245', company: { name: 'Acme Ltd' } });
});

async function issue(client: string) {
  const s = await getSettings();
  const seq = s.sequences[0];
  const inv = newInvoice(s, seq, (await nextAvailableNumber(seq)).number);
  inv.client.name = client;
  inv.lines[0] = { ...inv.lines[0], description: 'Fees', unitPrice: 1000 };
  return (await issueInvoice(inv)).invoice;
}

describe('Acceptance 6: export backup → clear browser data → import backup', () => {
  it('restores everything (incl. logo, numbering, retired numbers)', async () => {
    await updateSettings((s) => {
      s.company.logo = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
    });
    await issue('ABC Ltd');
    await issue('XYZ Ltd');
    const s = await getSettings();
    const draft = newInvoice(s, s.sequences[0], 'PSINV1247');
    await saveDraft(draft);
    await deleteDraft(draft.id); // PSINV1247 retired
    await db.clients.add({ id: 'c1', name: 'ABC Ltd', address: '', brn: '', vatNo: '', attention: '', email: '', phone: '', createdAt: '', updatedAt: '' });

    const json = await createBackupJson();
    expect(parseBackup(json).counts).toMatchObject({ invoices: 2, clients: 1, retiredNumbers: 1 });

    await db.delete(); // "clear browser data"
    await db.open();
    const report = await importBackup(json, 'replace');
    expect(report.added.invoices).toBe(2);

    const restored = await getSettings();
    expect(restored.company.name).toBe('Acme Ltd');
    expect(restored.company.logo).toBeInstanceOf(Blob);
    expect(new Uint8Array(await restored.company.logo!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
    expect(await db.clients.count()).toBe(1);
    expect((await checkNumber('PSINV1247')).state).toBe('retired');
    expect((await nextAvailableNumber(restored.sequences[0])).number).toBe('PSINV1248');
  });
});

describe('merge', () => {
  it('adds missing invoices, skips numbers that already exist, keeps the higher counter', async () => {
    await issue('ABC Ltd'); // PSINV1245
    const backup = await createBackupJson();

    // This browser meanwhile used PSINV1245 for a different invoice and moved on.
    await db.delete();
    await db.open();
    await completeOnboarding({ firstNumber: 'PSINV1245' });
    await issue('Other Ltd'); // PSINV1245 (different invoice)
    const seq = (await getSettings()).sequences[0];
    await saveSequence({ ...seq, nextNumber: 1300 });

    const report = await importBackup(backup, 'merge');
    expect(report.conflicts).toEqual(['PSINV1245']);
    expect(report.added.invoices ?? 0).toBe(0);
    expect(await db.invoices.count()).toBe(1);
    expect((await getSettings()).sequences[0].nextNumber).toBe(1300); // not moved back
    const log = await db.numberingLog.where('type').equals('import').toArray();
    expect(log[0].detail).toContain('skipped existing numbers: PSINV1245');
  });

  it('merging an older backup into an empty browser adds everything', async () => {
    await issue('ABC Ltd');
    const backup = await createBackupJson();
    await db.delete();
    await db.open();
    const r = await importBackup(backup, 'merge');
    expect(r.added.invoices).toBe(1);
    expect((await nextAvailableNumber((await getSettings()).sequences[0])).number).toBe('PSINV1246');
  });
});

describe('validation and CSV', () => {
  it('rejects files that are not backups', async () => {
    await expect(importBackup('not json', 'replace')).rejects.toBeInstanceOf(BackupFormatError);
    await expect(importBackup('{"hello":1}', 'replace')).rejects.toThrow(/not an Invoice Studio backup/);
  });

  it('CSV opens in Excel (BOM, quoted commas)', async () => {
    await issue('Smith, Jones & Co');
    const csv = invoicesCsv(await db.invoices.toArray());
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, row] = csv.slice(1).trim().split('\r\n');
    expect(header).toContain('Total VAT inclusive');
    expect(row).toContain('"Smith, Jones & Co"');
    expect(row).toContain('1150.00');
  });
});
