// ───────────────────────── Settings ─────────────────────────

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNo: string;
  iban: string;
  swift: string;
}

export interface CompanyProfile {
  name: string;
  tagline: string;
  /** Uploaded logo (PNG). Stored only in this browser; included in backups. */
  logo?: Blob;
  /** Legacy flag from earlier versions; no longer used. */
  hideLogo?: boolean;
  /** Invoice theme colours (primary = bars/headings, accent = dividers/highlights). */
  theme?: { primary: string; accent: string };
  address: string;
  brn: string;
  vatNo: string;
  phone: string;
  email: string;
  website: string;
  bank: BankDetails;
}

export interface InvoiceDefaults {
  currency: string;
  vatRate: number;
  termsDays: number;
  notes: string;
  templateId: string;
}

export type SequenceMode = 'auto' | 'manual';
export type DocType = 'invoice' | 'credit_note';

export interface NumberSequence {
  id: string;
  name: string;
  docType: DocType;
  mode: SequenceMode;
  /** Literal text before the counter. May contain {YYYY} {YY} {MM}. */
  prefix: string;
  /** The counter value the next invoice will receive. */
  nextNumber: number;
  /** Zero-pad the counter to at least this many digits. */
  minDigits: number;
  /** Literal text after the counter. May contain {YYYY} {YY} {MM}. */
  suffix: string;
}

export interface AppSettings {
  key: 'app';
  company: CompanyProfile;
  defaults: InvoiceDefaults;
  sequences: NumberSequence[];
  defaultSequenceId: string;
  onboarded: boolean;
  storageNoticeSeen: boolean;
  lastBackupAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Invoices ─────────────────────────

export interface LineItem {
  id: string;
  productId?: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  /** Exempt / zero-rated / disbursement: excluded from the VAT calculation. */
  noVat: boolean;
}

export interface PartySnapshot {
  clientId?: string;
  name: string;
  address: string;
  brn: string;
  vatNo: string;
  attention: string;
  email: string;
  phone: string;
}

export type SellerSnapshot = Omit<CompanyProfile, 'logo' | 'hideLogo'>;

export interface Payment {
  id: string;
  date: string; // yyyy-mm-dd
  amount: number;
  method: string;
  reference: string;
}

export type ActivityType =
  | 'created'
  | 'updated'
  | 'issued'
  | 'downloaded'
  | 'printed'
  | 'paid'
  | 'payment_removed'
  | 'voided'
  | 'credit_note'
  | 'duplicated';

export interface ActivityEntry {
  at: string; // ISO timestamp
  type: ActivityType;
  detail?: string;
}

/** Stored status. "Partially paid", "Paid" and "Overdue" are derived from payments + due date. */
export type StoredStatus = 'draft' | 'issued' | 'void';
export type DisplayStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';

export interface Invoice {
  id: string;
  docType: DocType;
  sequenceId: string;
  number: string;
  /** lowercase + trimmed; UNIQUE index. Undefined while a manual-mode draft has no number yet. */
  normalizedNumber?: string;
  /** Loose comparison key (separators and leading zeros removed) used for near-match warnings. */
  looseKey?: string;
  status: StoredStatus;
  issueDate: string; // yyyy-mm-dd
  dueDate: string; // yyyy-mm-dd
  termsDays: number;
  currency: string;
  /** One VAT rate for the whole invoice, in % (e.g. 15, 0, 12.5). */
  vatRate: number;
  seller: SellerSnapshot;
  client: PartySnapshot;
  clientId?: string;
  lines: LineItem[];
  notes: string;
  templateId: string;
  payments: Payment[];
  history: ActivityEntry[];
  creditNoteFor?: string;
  /** Set on drafts created by a recurring schedule. */
  recurringRuleId?: string;
  /** The schedule date this draft was created for. */
  recurringDate?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
}

// ───────────────────────── Other tables ─────────────────────────

export interface Client {
  id: string;
  name: string;
  address: string;
  brn: string;
  vatNo: string;
  attention: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  unitPrice: number;
  noVat: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TemplateKind = 'docx' | 'pdf' | 'image' | 'fillable-pdf';

export interface FieldBox {
  id: string;
  field: string;
  page: number;
  /** Position and size as fractions (0–1) of the page width/height. */
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  align: 'left' | 'center' | 'right';
}

export interface StoredTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  file: Blob;
  fileName: string;
  thumbnail?: Blob;
  tags?: string[];
  fieldBoxes?: FieldBox[];
  pdfFieldMap?: Record<string, string>;
  createdAt: string;
}

export type NumberingLogType =
  | 'skip'
  | 'manual'
  | 'jump'
  | 'release'
  | 'deleted_draft'
  | 'sequence_created'
  | 'import';

/** Numbers from deleted drafts: retired forever, never reused or offered again. */
export interface RetiredNumber {
  normalizedNumber: string;
  number: string;
  sequenceId: string;
  at: string;
  reason: string;
  clientName?: string;
}

export interface NumberingLogEntry {
  id?: number;
  at: string;
  sequenceId: string;
  type: NumberingLogType;
  from?: string;
  to?: string;
  reason?: string;
  invoiceId?: string;
  detail?: string;
}

/**
 * Device-local state (table `local`): never included in backups and never
 * triggers an automatic backup. Holds the auto-save folder connection.
 */
export interface FolderSyncState {
  key: 'folder';
  enabled: boolean;
  /** FileSystemDirectoryHandle (structured-cloneable in Chromium browsers). */
  handle?: unknown;
  folderName?: string;
  lastSavedAt?: string;
  lastError?: string;
}

export type RecurringInterval = 'monthly' | 'quarterly' | 'yearly';
export type RecurringStatus = 'active' | 'paused' | 'stopped' | 'finished';

/** What each generated invoice is made from (descriptions/notes may use {month} {year}). */
export interface RecurringContent {
  sequenceId: string;
  client: PartySnapshot;
  lines: LineItem[];
  notes: string;
  currency: string;
  vatRate: number;
  termsDays: number;
  templateId: string;
}

export interface RecurringRule {
  id: string;
  name: string;
  sourceInvoiceId: string;
  sourceNumber: string;
  interval: RecurringInterval;
  /** First invoice date; later dates keep its day of the month (31st → last day of shorter months). */
  startDate: string; // yyyy-mm-dd
  /** Date of the next invoice to create. */
  nextRunDate: string; // yyyy-mm-dd
  endDate?: string; // stop after this date (inclusive)
  maxCount?: number; // or after this many invoices
  createdCount: number;
  status: RecurringStatus;
  content: RecurringContent;
  /** Every invoice created so far (the date is the duplicate guard). */
  generated: { date: string; invoiceId: string; number: string }[];
  createdAt: string;
  updatedAt: string;
}
