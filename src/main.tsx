import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts (bundled, no CDN): Inter for UI, Playfair Display for headings.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-700.css';
// Invoice template fonts: Arimo (= Arial metrics) and Gelasio (= Georgia metrics), as in the Excel template.
import '@fontsource/arimo/latin-400.css';
import '@fontsource/arimo/latin-400-italic.css';
import '@fontsource/arimo/latin-600.css';
import '@fontsource/arimo/latin-700.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/gelasio/latin-400-italic.css';
import '@fontsource/gelasio/latin-700.css';
import './index.css';

import { App } from './App';
import { importLegacyDatabase } from './db/legacyImport';

async function start() {
  // The database was renamed: carry existing data over before anything reads it.
  const imported = await importLegacyDatabase().catch((e) => {
    console.error('Could not import data from the previous database', e);
    return null;
  });
  // Recurring schedules: create any due drafts (including missed ones) before showing the app.
  const { generateDueRecurring } = await import('./db/recurringRepo');
  const recurringCreated = await generateDueRecurring().catch((e) => {
    console.error('Recurring invoices could not be created', e);
    return [];
  });
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Auto-save to folder (if the user turned it on in Settings ▸ Data & backup).
  void import('./sync/folderSyncBrowser').then((m) => m.startFolderSync()).catch((e) => console.error(e));
  if (recurringCreated.length) {
    const { toast } = await import('sonner');
    const n = recurringCreated.length;
    setTimeout(() => toast.success(`${n} recurring invoice${n === 1 ? ' is' : 's are'} ready to review.`), 700);
  }
  if (imported) {
    const { toast } = await import('sonner');
    setTimeout(() => toast.success('Your invoices and settings were moved to the new storage.'), 600);
  }
}
void start();
