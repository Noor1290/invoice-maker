import { useSyncExternalStore } from 'react';
import { db } from '@/db/db';
import type { FolderSyncState, Invoice } from '@/db/types';
import { createBackupJson, importBackup, type ImportMode } from '@/db/backup';
import { BACKUPS_DIR, FolderSyncEngine, listFiles, readTextAt, type DirHandleLike } from './folder';
import { attachChangeHooks } from './hooks';

/** File System Access API is available in Chromium desktop browsers (Edge, Chrome). */
export const folderAccessSupported =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

type PermissionHandle = DirHandleLike & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};

async function folderState(): Promise<FolderSyncState | undefined> {
  return db.local.get('folder');
}

async function getRoot(): Promise<DirHandleLike | 'reconnect' | null> {
  const st = await folderState();
  if (!st?.enabled || !st.handle) return null;
  const h = st.handle as PermissionHandle;
  const perm = (await h.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  return perm === 'granted' ? h : 'reconnect';
}

async function renderPdf(inv: Invoice): Promise<Blob> {
  const settings = await db.settings.get('app');
  const logo = settings?.company.logo;
  const url = logo ? URL.createObjectURL(logo) : null;
  try {
    const { renderInvoicePdf } = await import('@/pdf/renderPdf');
    return await renderInvoicePdf(inv, url);
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

export const folderSync = new FolderSyncEngine({
  getRoot,
  loadInvoice: (id) => db.invoices.get(id),
  renderPdf,
  exportBackup: createBackupJson,
  onSaved: async (at) => {
    await db.local.update('folder', { lastSavedAt: at, lastError: undefined });
  },
  onError: async (message) => {
    await db.local.update('folder', { lastError: message });
  },
});

let started = false;

/** Called once at start-up: watch for changes and check the folder connection. */
export async function startFolderSync() {
  if (started) return;
  started = true;
  attachChangeHooks(db, folderSync);
  const st = await folderState();
  if (!st?.enabled) return;
  if (!folderAccessSupported) {
    folderSync.setStatus({ state: 'error', message: 'This browser cannot write to folders. Use Edge or Chrome on a computer.' });
    return;
  }
  folderSync.setStatus({ state: 'pending', lastSavedAt: st.lastSavedAt });
  await folderSync.flush(); // shows "reconnect" if the browser needs permission again
  if (folderSync.getStatus().state === 'off') folderSync.setStatus({ state: 'ok', lastSavedAt: st.lastSavedAt });
  // Save once on start so the latest backup reflects this session.
  folderSync.queueBackup();
}

/** Pick a folder (must be called from a click). */
export async function chooseFolder(): Promise<string> {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<PermissionHandle> }).showDirectoryPicker;
  const handle = await pick({ id: 'invoice-studio', mode: 'readwrite', startIn: 'documents' });
  const perm = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (perm !== 'granted') throw new Error('Permission to write to this folder was not given.');
  await db.local.put({ key: 'folder', enabled: true, handle, folderName: handle.name });
  folderSync.setStatus({ state: 'pending' });
  folderSync.queueBackup();
  await folderSync.flush();
  return handle.name;
}

/** Ask the browser for permission again (must be called from a click). */
export async function reconnectFolder(): Promise<boolean> {
  const st = await folderState();
  const h = st?.handle as PermissionHandle | undefined;
  if (!h) return false;
  const perm = (await h.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (perm !== 'granted') return false;
  folderSync.queueBackup();
  await folderSync.flush();
  return folderSync.getStatus().state === 'ok';
}

export async function disableFolderSync() {
  await db.local.put({ key: 'folder', enabled: false });
  folderSync.dispose();
  folderSync.setStatus({ state: 'off' });
}

export async function saveAllPdfsNow(): Promise<number> {
  return folderSync.saveAll(await db.invoices.toArray());
}

export async function listFolderBackups() {
  const root = await getRoot();
  if (!root || root === 'reconnect') return [];
  return listFiles(root, [BACKUPS_DIR]);
}

export async function readFolderBackup(name: string): Promise<string | null> {
  const root = await getRoot();
  if (!root || root === 'reconnect') return null;
  return readTextAt(root, [BACKUPS_DIR, name]);
}

/** Import without generating a PDF per restored invoice; one backup is written afterwards. */
export async function importBackupQuietly(text: string, mode: ImportMode) {
  const report = await folderSync.quietly(() => importBackup(text, mode));
  folderSync.queueBackup();
  return report;
}

export function useFolderStatus() {
  return useSyncExternalStore(folderSync.subscribe, folderSync.getStatus);
}
