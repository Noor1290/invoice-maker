# Invoice Studio

Professional VAT invoicing that runs entirely in the browser. No server, no database server, no sign-in: everything stays in the browser it was created in (with optional automatic backups to a folder you choose).

- **Your business, your data.** Company name, address, logo, bank details and theme colours are entered in the app and stored only in your browser (and in your backups). Nothing about your business is part of this code.
- **Numbers you can trust.** Free-format invoice numbers (`00012`, `PSINV1245`, `INV-2026-0001`…) that continue automatically, with live duplicate checks. A number is never used twice, not even after voiding or deleting a draft.
- **One VAT rate per invoice** (default 15%, any rate allowed) with a "No VAT" tick for exempt or zero-rated lines. Totals are calculated in whole cents.
- **Live A4 preview**, PDF download (embedded fonts, selectable text), Word download and printing on A4, all matching the preview.
- **Templates:** Classic, Minimal and Compact in your theme colours, or your own Word (.docx) design with tags.
- **Clients, products, payments, credit notes, recurring invoices**, a dashboard with outstanding/overdue totals, backup/restore and CSV export.
- Works offline after the first visit and can be installed as an app.

## Using it

Open the app and follow **Getting started** (the ? icon at the top right). In short:

1. On first run, enter the number of your next invoice (e.g. `PSINV1245`) and your business details.
2. **New invoice**: pick or type a client, add lines (type a saved product's name to fill it in), check the preview, then **Issue invoice**. Issuing locks the number and content; to correct an issued invoice, void it or create a credit note.
3. **PDF**, **Word** and **Print** buttons are at the top of the editor (Ctrl+D / Ctrl+P).
4. Record payments on issued invoices; the status becomes Partially paid, Paid or Overdue automatically.
5. **More ▸ Repeat this invoice** bills an invoice monthly, quarterly or yearly. Drafts are created when the app is opened (missed ones too, each with its own date) and wait on the dashboard under **Review & issue**. Nothing is ever issued automatically. Line descriptions can use `{month}`, `{year}`, `{month_short}` and `{quarter}`.

### Keyboard shortcuts (Cmd on Mac)

| Keys | Action |
| --- | --- |
| Ctrl+S | Save now (drafts also save automatically) |
| Ctrl+Enter | Add a line item |
| Enter | Next line (adds one on the last line) |
| Ctrl+Backspace | Delete the current line |
| Alt+↑ / Alt+↓ | Move a line |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+D / Ctrl+P | Download PDF / print |

## Word templates

- **Word** downloads an editable `.docx` of any invoice or credit note.
- **Templates ▸ Your Word templates**: upload your own `.docx` containing tags such as `{invoice_number}`, `{client_name}`, `{total_vat_exclusive}`, `{vat_rate}`, `{vat_label}`, `{vat_total}`, `{total_vat_inclusive}`, `{balance_due}`, `{amount_in_words}`. Put `{#items}` … `{/items}` in one table row to repeat it for every line (`{no} {description} {qty} {unit_price} {discount} {amount} {vat}`). Credit notes fill `{document_title}` ("CREDIT NOTE") and `{credit_note_for}`.
- The **Tag reference** lists every tag with a copy button; **Sample .docx** contains all of them. On upload the app lists the tags it found and warns about unknown, renamed (`{total_due}` → `{total_vat_inclusive}`) or missing ones.
- Invoices on a Word template download as Word in one click. For a PDF, use **Print** and choose **Save as PDF**.

## ⚠️ Back up your data

Everything (invoices, clients, products, settings, numbering, recurring schedules, templates and your logo) is stored **in this browser on this computer** (IndexedDB database `invoice-studio-db`). Clearing browser data, or switching browser or computer, means you won't see it.

- **Settings ▸ Data & backup ▸ Export backup** writes one `.json` file with everything. **Import backup** restores it (or merges it, skipping any invoice number that already exists), and numbering carries on from the right number.
- **Auto-save to a folder** (Edge or Chrome on a computer): pick a folder, ideally inside OneDrive, Google Drive or Dropbox so it syncs to the cloud. No sign-in is needed.
  - `Invoices/YYYY-MM/{InvoiceNo}_{ClientName}.pdf`: saved when an invoice is issued, re-saved when a payment is recorded or it is voided (`.docx` for invoices on a Word template).
  - `Backups/invoice-studio-backup-latest.json`: rewritten about 10 seconds after any change, plus `invoice-studio-backup-YYYY-MM.json` kept for each month.
  - If the browser needs permission again (e.g. after a restart), a banner asks you to reconnect the folder; nothing is lost meanwhile. The icon at the top right shows the status (green / amber / red).
  - Firefox, Safari and phones can't write to folders: use **Export backup** there.
- **Export invoices to Excel/CSV** for your accountant.
- The app asks the browser for *persistent storage* so data isn't evicted when disk space runs low; a reminder appears if no backup was made for 30 days.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (numbering, totals, PDF, Word, backup, folder auto-save, recurring…)
npm run build      # production build in /dist
npm run preview    # serve the production build
```

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In the repository, open **Settings ▸ Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). `.github/workflows/deploy.yml` tests, builds and publishes the site.

GitHub Pages serves a project site at `https://<username>.github.io/<repository-name>/`. The workflow sets the Vite base path from the repository name automatically, so the site works whatever the repository is called. URLs use a hash (`/#/settings/numbering`), so refreshing any page never shows a GitHub 404. After the first visit a service worker caches the app so it works offline; updates are picked up on the next load.

**Never commit client data.** `.gitignore` excludes `*.xlsx`, `*.xls`, `*.csv`, `*backup*.json` and `backups/`.

## Tech

Vite · React · TypeScript · Tailwind CSS · Radix (shadcn-style components) · React Hook Form + Zod · Dexie (IndexedDB) · @react-pdf/renderer · docx · docxtemplater · docx-preview · vite-plugin-pwa · Vitest. See `CLAUDE.md` for how the code is organised.
