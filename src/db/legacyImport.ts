import Dexie from 'dexie';
import { BUILT_IN_TEMPLATE_IDS, db as appDb, upgradeInvoiceRecord, upgradeProductRecord, type AppDB } from './db';

/**
 * The app's database was renamed. On first start under the new name, copy the
 * data from the previous database so nothing is lost.
 *
 * The previous database is recognised by its shape (a "*-invoice-db" database with
 * this app's settings / invoices / numberingLog tables), not by a hard-coded name.
 * It is left untouched as a fallback.
 */
const REQUIRED_TABLES = ['settings', 'invoices', 'numberingLog'];

export async function importLegacyDatabase(target: AppDB = appDb): Promise<string | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  await target.open();
  if ((await target.settings.count()) + (await target.invoices.count()) > 0) return null;

  const candidates = (await indexedDB.databases())
    .map((d) => d.name)
    .filter((n): n is string => !!n && n !== target.name && /-invoice-db$/i.test(n));

  for (const name of candidates) {
    const legacy = new Dexie(name); // dynamic mode: opens whatever schema is there
    try {
      await legacy.open();
    } catch {
      continue;
    }
    try {
      const tables = legacy.tables.map((t) => t.name);
      if (!REQUIRED_TABLES.every((t) => tables.includes(t))) continue;
      const hasData = (await legacy.table('settings').count()) + (await legacy.table('invoices').count()) > 0;
      if (!hasData) continue;

      const uploadedTemplateIds = new Set(
        tables.includes('templates') ? (await legacy.table('templates').toCollection().primaryKeys()).map(String) : [],
      );
      const fixTemplate = (id: unknown) =>
        typeof id === 'string' && (BUILT_IN_TEMPLATE_IDS.includes(id) || uploadedTemplateIds.has(id)) ? id : 'classic';

      // Read everything first: an IndexedDB transaction can't stay open while awaiting another database.
      const data = new Map<string, Record<string, unknown>[]>();
      for (const table of target.tables) {
        if (!tables.includes(table.name)) continue;
        const rows = (await legacy.table(table.name).toArray()) as Record<string, unknown>[];
        for (const r of rows) {
          if (table.name === 'invoices') {
            upgradeInvoiceRecord(r);
            r.templateId = fixTemplate(r.templateId);
          }
          if (table.name === 'products') upgradeProductRecord(r);
          if (table.name === 'settings' && r.defaults && typeof r.defaults === 'object') {
            const d = r.defaults as { templateId?: string };
            d.templateId = fixTemplate(d.templateId);
          }
        }
        data.set(table.name, rows);
      }
      await target.transaction('rw', target.tables, async () => {
        for (const table of target.tables) {
          const rows = data.get(table.name);
          if (rows?.length) await table.bulkPut(rows);
        }
      });
      return name;
    } finally {
      legacy.close();
    }
  }
  return null;
}
