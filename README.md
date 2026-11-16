# Invoice Studio

Professional VAT invoicing that runs entirely in the browser. There is no server, no database server and no login: everything stays in the browser it was created in.

- Your company name, address, logo, bank details and theme colours are entered in the app (on first run, or later in **Settings**). They are stored **only in your browser** and included in backups. Nothing about your business is part of this code.
- Default currency MUR and standard VAT 15%; both can be changed in **Settings ▸ Invoice defaults** and per invoice.
- Built-in templates: **Classic**, **Minimal** and **Compact**, all following your theme colours (default navy and gold).

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (numbering, duplicates, totals, PDF…)
npm run build      # production build in /dist
npm run preview    # serve the production build
```

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In the repository, open **Settings ▸ Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). `.github/workflows/deploy.yml` tests, builds and publishes the site.

GitHub Pages serves a project site at `https://<username>.github.io/<repository-name>/`. The workflow sets the Vite base path from the repository name automatically, so the site works whatever the repository is called (e.g. a repository named `invoice-studio` is served at `/invoice-studio/`). URLs use a hash (`/#/settings/numbering`), so refreshing any page never shows a GitHub 404. After the first visit the app is cached by a service worker and works offline; it can also be installed as an app (browser menu ▸ *Install*).

## ⚠️ Back up your data

Invoices, clients, products, settings, logo and uploaded templates are stored **in this browser on this computer** (IndexedDB database `invoice-studio-db`).

- Clearing browser data, or using a different browser or computer, means you won't see them.
- Use **Settings ▸ Data & backup ▸ Export backup** regularly and keep the `.json` file somewhere safe.
- **Import backup** restores everything, including the invoice numbering, so new invoices carry on from the right number.
- Never commit backups or exported spreadsheets: `.gitignore` excludes `*backup*.json`, `*.xlsx`, `*.xls` and `*.csv`.

### Auto-save to a folder (Edge / Chrome on a computer)

**Settings ▸ Data & backup ▸ Automatically save invoices and backups to a folder on this computer.** Pick a folder (a folder inside OneDrive, Google Drive or Dropbox syncs to the cloud automatically). No sign-in is needed:

- `Invoices/YYYY-MM/{InvoiceNo}_{ClientName}.pdf`: saved when an invoice is issued, and re-saved when a payment is recorded or it is voided.
- `Backups/invoice-studio-backup-latest.json`: rewritten about 10 seconds after any change.
- `Backups/invoice-studio-backup-YYYY-MM.json`: one per month, kept.

If the browser needs permission again (e.g. after a restart), a banner asks you to reconnect the folder; nothing is lost in the meantime. **Restore from this folder** (or **Import backup**) brings everything back from these files. Firefox, Safari and phones can't write to folders; use **Export backup** there.

The app asks the browser for *persistent storage* on first run so that data isn't cleared automatically when disk space runs low. Clearing browser data manually still deletes it.

## Tech

Vite · React · TypeScript · Tailwind CSS · shadcn-style components (Radix) · React Hook Form + Zod · Dexie (IndexedDB) · @react-pdf/renderer · vite-plugin-pwa.
