import type { NumberSequence } from '@/db/types';

/**
 * Free-format invoice numbers.
 *
 * A number is split at its LAST run of digits:
 *   "PSINV1245"      → prefix "PSINV",     digits "1245", suffix ""
 *   "INV-2026-0009"  → prefix "INV-2026-", digits "0009", suffix ""
 *   "INV-0042/A"     → prefix "INV-",      digits "0042", suffix "/A"
 * Leading zeros are kept as the minimum width, and the counter may grow past it
 * (PSINV0999 → PSINV1000, 99 → 100).
 */
export interface ParsedNumber {
  prefix: string;
  digits: string;
  value: number;
  suffix: string;
}

const MAX_DIGITS = 15; // stays within Number.MAX_SAFE_INTEGER

export function parseInvoiceNumber(raw: string): ParsedNumber | null {
  const s = raw.trim();
  const m = s.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  if (digits.length > MAX_DIGITS) return null;
  return { prefix, digits, value: parseInt(digits, 10), suffix };
}

export function padNumber(value: number, minDigits: number): string {
  return String(value).padStart(Math.max(1, minDigits), '0');
}

/** "00012" → "00013", "PSINV0999" → "PSINV1000". Returns null when there is nothing to count. */
export function incrementInvoiceNumber(raw: string, by = 1): string | null {
  const p = parseInvoiceNumber(raw);
  if (!p) return null;
  return p.prefix + padNumber(p.value + by, p.digits.length) + p.suffix;
}

/** Exact comparison key: case-insensitive, surrounding spaces ignored. */
export function normalizeNumber(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Loose key used for "near match" warnings only (never for blocking):
 * "00012" ~ "12", "PSINV-1245" ~ "psinv1245".
 */
export function looseKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ''));
}

// ───────────────────────── Tokens ─────────────────────────

export const NUMBER_TOKENS = ['{YYYY}', '{YY}', '{MM}'] as const;

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export function resolveTokens(text: string, date: Date | string = new Date()): string {
  const d = toDate(date);
  const yyyy = String(d.getFullYear());
  return text
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, String(d.getMonth() + 1).padStart(2, '0'));
}

// ───────────────────────── Sequences ─────────────────────────

type SequenceFormat = Pick<NumberSequence, 'prefix' | 'suffix' | 'minDigits'>;

export function formatSequenceNumber(
  seq: SequenceFormat,
  value: number,
  date: Date | string = new Date(),
): string {
  return resolveTokens(seq.prefix, date) + padNumber(value, seq.minDigits) + resolveTokens(seq.suffix, date);
}

export function formatNext(seq: NumberSequence, date: Date | string = new Date()): string {
  return formatSequenceNumber(seq, seq.nextNumber, date);
}

/** The next `count` numbers in the sequence, for previews ("PSINV1245, PSINV1246, PSINV1247…"). */
export function upcomingNumbers(seq: SequenceFormat & { nextNumber: number }, count = 3, date: Date | string = new Date()) {
  return Array.from({ length: count }, (_, i) => formatSequenceNumber(seq, seq.nextNumber + i, date));
}

/** Build a sequence format from an example such as "PSINV1245" (the first-run question). */
export function sequenceFromExample(example: string): Pick<NumberSequence, 'prefix' | 'nextNumber' | 'minDigits' | 'suffix'> | null {
  const p = parseInvoiceNumber(example);
  if (!p) return null;
  return { prefix: p.prefix, nextNumber: p.value, minDigits: p.digits.length, suffix: p.suffix };
}

/**
 * If `number` belongs to `seq` (same resolved prefix/suffix, digits in between),
 * return its counter value; otherwise null.
 */
export function matchSequenceValue(seq: NumberSequence, number: string, date: Date | string = new Date()): number | null {
  const n = number.trim().toLowerCase();
  const prefix = resolveTokens(seq.prefix, date).toLowerCase();
  const suffix = resolveTokens(seq.suffix, date).toLowerCase();
  if (!n.startsWith(prefix) || !n.endsWith(suffix)) return null;
  const middle = n.slice(prefix.length, n.length - suffix.length);
  if (!/^\d+$/.test(middle) || middle.length > MAX_DIGITS) return null;
  return parseInt(middle, 10);
}

export interface SkipRange {
  first: string;
  last: string;
  count: number;
  label: string;
}

/**
 * Numbers that would be skipped when the counter moves from `fromValue` to `toValue`
 * (toValue is the number actually used next). Null when nothing is skipped.
 */
export function skipRange(seq: SequenceFormat, fromValue: number, toValue: number, date: Date | string = new Date()): SkipRange | null {
  const count = toValue - fromValue;
  if (count <= 0) return null;
  const first = formatSequenceNumber(seq, fromValue, date);
  const last = formatSequenceNumber(seq, toValue - 1, date);
  const label = count === 1 ? `Number ${first} will be skipped` : `Numbers ${first}–${last} will be skipped`;
  return { first, last, count, label };
}

/** "422–499 (78 numbers)" or "422" */
export function describeSkip(range: SkipRange): string {
  return range.count === 1 ? range.first : `${range.first}–${range.last} (${range.count} numbers)`;
}

export function validateSequenceFormat(seq: Partial<NumberSequence>): string | null {
  if (seq.nextNumber === undefined || !Number.isInteger(seq.nextNumber) || seq.nextNumber < 0)
    return 'Next number must be a whole number (0 or more).';
  if (String(seq.nextNumber).length > MAX_DIGITS) return 'Next number is too large.';
  if (seq.minDigits === undefined || !Number.isInteger(seq.minDigits) || seq.minDigits < 1 || seq.minDigits > 12)
    return 'Minimum digits must be between 1 and 12.';
  return null;
}

/** Soft warning (does not block saving). */
export function sequenceFormatWarning(seq: Pick<NumberSequence, 'prefix'>): string | null {
  if (/\d$/.test(resolveTokens(seq.prefix))) {
    return 'The prefix ends with a digit, so it runs straight into the counter (e.g. INV20260001). Consider adding a separator such as "-".';
  }
  return null;
}
