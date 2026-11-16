# CLAUDE.md: working on Invoice Studio

Browser-only VAT invoicing app (Vite + React + TypeScript + Tailwind v4 + Dexie). Deployed as a static site to GitHub Pages. No backend: all data lives in IndexedDB in the user's browser.

## Commands

```bash
npm run dev          # dev server
npm test             # vitest (node env + fake-indexeddb); all tests must pass
npx tsc -p tsconfig.json --noEmit   # type-check (TypeScript 7 native compiler)
npm run build        # tsc -b && vite build → dist/
VITE_BASE=/repo-name/ npm run build # what CI does (base path = /<repo>/)
```

On Windows, set `VITE_BASE` from PowerShell/cmd, not Git Bash: MSYS rewrites `/repo-name/` into a Windows path and the built site loads nothing.

## Ground rules

- **No company-specific data in the repo.** The app is generic ("Invoice Studio"). Company name, logo, address, colours etc. are user data stored in IndexedDB. Never add a real business name, logo or address to source, tests, fixtures or commit messages. Test data uses neutral names (Acme Trading Ltd, ABC Ltd, Example Client Ltd).
- **Never commit user data**: no `.xlsx`, `.csv`, backup `.json` files (see `.gitignore`).
- Keep the UI copy plain and friendly; British English (e.g. "colour", "authorised").

## Architecture (src/)

| Path | What |
| --- | --- |
| `db/db.ts` | Dexie schema (`invoice-studio-db`), versions 1–5 with upgrades. Add a new `version(n)` for schema changes; never edit old ones. |
| `db/types.ts` | All persisted types. |
| `db/invoiceRepo.ts` | Saving/issuing/voiding/deleting drafts, payments, number checks. **All writes that touch numbering go through here.** |
| `db/settingsRepo.ts` | Settings, onboarding, numbering sequences (skip log). |
| `db/backup.ts` | Export/import (replace or merge) of every table except `local`; Blobs as base64. |
| `db/recurringRepo.ts` + `lib/recurrence.ts` | Recurring schedules (pure date maths in `lib`). |
| `db/legacyImport.ts` | One-time copy from a previous `*-invoice-db` database (detected by shape). |
| `lib/numbering.ts` | Free-format number parsing/formatting (split at the last run of digits). |
| `lib/money.ts` | Totals engine (integer cents, one VAT rate per invoice, "No VAT" lines). |
| `templates/` | Built-in templates (Classic, Minimal, Compact) written once against renderer-neutral primitives (`primitives.tsx`), a document model (`model.ts`), text measurement and pagination, theme palette. |
| `features/preview/` | HTML rendering of templates (preview, thumbnails, print portal). |
| `pdf/` | Same templates rendered with @react-pdf/renderer (loaded lazily). |
| `word/` | Word export (`builtin.ts` via `docx`), uploaded .docx templates (`template.ts` via docxtemplater), tags, sample template, docx-preview component. |
| `sync/` | Auto-save to a folder (File System Access API): engine (`folder.ts`, testable with an in-memory directory), Dexie change hooks, browser wiring. |
| `features/editor/` | Invoice editor (React Hook Form + Zod), autosave, undo/redo, line items, payments, number field. |
| `features/*`, `pages/` | Other screens (dashboard, clients, products, templates, recurring, settings, guide). |

## Invariants: don't break these

1. **An invoice number is never used twice.** Unique index on `invoices.normalizedNumber` (lower-case, trimmed) and a re-check inside the write transaction. Voided invoices keep their number; deleted drafts put theirs in `retiredNumbers`. `nextAvailableNumber` skips both. Numbering counters never move backwards on import/merge.
2. **Issued invoices are locked.** Only payments, history and void may change them (`saveDraft` refuses non-drafts). Corrections = void or credit note.
3. **Money is calculated in integer cents** (`toCents`). VAT = ROUND(sum of VAT-able line amounts × rate, 2). Exclusive + VAT = Inclusive to the cent (property test in `money.test.ts`).
4. **Preview, PDF and print must match.** Templates only use the `Style` keys in `primitives.tsx` (lengths in pt). All multi-line text is pre-wrapped with `measure.ts` and pagination is computed before rendering, so both renderers break identically. When adding template elements:
   - give absolutely positioned views an explicit `width` (react-pdf gives them 0 width otherwise);
   - always set `fontSize` on text inside fixed-height views (react-pdf drops text whose line doesn't fit);
   - don't set `wrap={false}` on react-pdf pages (it drops absolutely positioned content).
   `pdf/pdf.test.tsx` checks text, fonts, page counts and that the page counter is one text run.
5. **Recurring invoices are drafts, never issued automatically, never duplicated.** Generation runs per schedule inside one transaction with a (schedule, date) guard.
6. **The `local` table is device-only** (folder handle): never exported in backups, not watched by the auto-save hooks (writing "last saved" there must not trigger another save).
7. Autosave reserves a number only after the user actually types; a suggested number is not reserved.

## Testing

- Unit/integration tests live next to the code (`*.test.ts[x]`) and run in Node with `fake-indexeddb` (see `src/test/setup.ts`). Tests that need a clean DB call `db.delete(); db.open()` in `beforeEach`.
- Acceptance tests from the original spec are named "Acceptance N" in the tests (numbering, totals, duplicates, skips, backup/restore, Word loop).
- Browser checks (Edge/Chrome) were done with Playwright scripts kept outside the repo; for UI changes, check the live preview, a downloaded PDF and the print view, at desktop and 390 px width, and run an accessibility check (axe-core, WCAG 2.1 AA).

## Conventions

- Path alias `@/` → `src/`. Files written with LF line endings (`.gitattributes`).
- UI components are hand-written shadcn-style components in `components/ui` (Radix primitives via the `radix-ui` package).
- Heavy libraries (react-pdf, docx, docxtemplater, docx-preview) are imported dynamically where possible.
- Commit messages: imperative summary + bullet list.
