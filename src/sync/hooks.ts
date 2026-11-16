import type { AppDB } from '@/db/db';
import type { Invoice } from '@/db/types';
import type { FolderSyncEngine } from './folder';

/** Tables whose changes trigger an automatic backup (everything except the device-local table). */
const BACKED_UP = ['settings', 'invoices', 'clients', 'products', 'templates', 'numberingLog', 'recurring', 'retiredNumbers'];

/**
 * Watch the database: any change queues a (debounced) backup; an invoice that is
 * issued, paid, un-paid or voided queues its PDF. Returns a function that detaches.
 */
export function attachChangeHooks(db: AppDB, engine: FolderSyncEngine): () => void {
  const detach: (() => void)[] = [];
  const backup = () => {
    engine.queueBackup();
  };

  for (const name of BACKED_UP) {
    const t = db.table(name);
    for (const ev of ['creating', 'updating', 'deleting'] as const) {
      // Dexie hook typings differ per event; the callback only schedules work.
      t.hook(ev as 'creating').subscribe(backup as never);
      detach.push(() => t.hook(ev as 'creating').unsubscribe(backup as never));
    }
  }

  const onCreate = (_key: unknown, obj: Invoice) => {
    if (obj.status !== 'draft') engine.queuePdf(obj.id);
  };
  const onUpdate = (mods: Partial<Invoice>, _key: unknown, obj: Invoice) => {
    const status = 'status' in mods ? mods.status : obj.status;
    if (status !== 'draft' && ('status' in mods || 'payments' in mods)) engine.queuePdf(obj.id);
  };
  db.invoices.hook('creating').subscribe(onCreate as never);
  db.invoices.hook('updating').subscribe(onUpdate as never);
  detach.push(() => db.invoices.hook('creating').unsubscribe(onCreate as never));
  detach.push(() => db.invoices.hook('updating').unsubscribe(onUpdate as never));

  return () => detach.forEach((d) => d());
}
