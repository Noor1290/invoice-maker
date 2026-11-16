import type { RecurringInterval, RecurringRule } from '@/db/types';

/**
 * Recurring schedule maths (pure, no storage).
 * Dates are local calendar dates as "yyyy-mm-dd".
 */

const MONTHS_PER: Record<RecurringInterval, number> = { monthly: 1, quarterly: 3, yearly: 12 };
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(d: string): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/**
 * The n-th occurrence after `start` (n = 0 is the start itself). Always computed from the
 * start date so the day of the month is kept: 31 Jan → 28 Feb → 31 Mar.
 */
export function occurrence(start: string, interval: RecurringInterval, n: number): string {
  const [y, m, d] = parts(start);
  const total = m - 1 + n * MONTHS_PER[interval];
  const yy = y + Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return iso(yy, mm, Math.min(d, daysIn(yy, mm)));
}

/** Index of an occurrence date (the number of steps from the start). */
export function occurrenceIndex(start: string, interval: RecurringInterval, date: string): number {
  const [y1, m1] = parts(start);
  const [y2, m2] = parts(date);
  return Math.round(((y2 - y1) * 12 + (m2 - m1)) / MONTHS_PER[interval]);
}

export function nextOccurrence(rule: Pick<RecurringRule, 'startDate' | 'interval'>, after: string): string {
  return occurrence(rule.startDate, rule.interval, occurrenceIndex(rule.startDate, rule.interval, after) + 1);
}

/** Has the schedule run out (end date or number of times)? */
export function isFinished(rule: Pick<RecurringRule, 'nextRunDate' | 'endDate' | 'maxCount' | 'createdCount'>): boolean {
  if (rule.maxCount !== undefined && rule.createdCount >= rule.maxCount) return true;
  if (rule.endDate && rule.nextRunDate > rule.endDate) return true;
  return false;
}

/** Every date that is due (on or before today) and not created yet, oldest first. */
export function dueDates(
  rule: Pick<RecurringRule, 'startDate' | 'interval' | 'nextRunDate' | 'endDate' | 'maxCount' | 'createdCount' | 'status' | 'generated'>,
  today: string,
): string[] {
  if (rule.status !== 'active') return [];
  const done = new Set(rule.generated.map((g) => g.date));
  const out: string[] = [];
  let date = rule.nextRunDate;
  let count = rule.createdCount;
  for (let guard = 0; guard < 1200 && date <= today; guard++) {
    if (rule.endDate && date > rule.endDate) break;
    if (rule.maxCount !== undefined && count >= rule.maxCount) break;
    if (!done.has(date)) {
      out.push(date);
      count++;
    }
    date = nextOccurrence(rule, date);
  }
  return out;
}

/** "{month} {year}" → "November 2026" for the invoice date. Also {month_short} and {quarter}. */
export function applyPlaceholders(text: string, date: string): string {
  const [y, m] = parts(date);
  return text
    .replace(/\{month\}/gi, MONTH_NAMES[m - 1])
    .replace(/\{month_short\}/gi, MONTH_NAMES[m - 1].slice(0, 3))
    .replace(/\{year\}/gi, String(y))
    .replace(/\{quarter\}/gi, `Q${Math.ceil(m / 3)}`);
}

/**
 * When setting up a schedule from an invoice, turn the invoice's own month into placeholders:
 * "Bookkeeping – October 2026" (invoice dated October 2026) → "Bookkeeping – {month} {year}".
 */
export function suggestPlaceholders(text: string, invoiceDate: string): string {
  const [y, m] = parts(invoiceDate);
  const name = MONTH_NAMES[m - 1];
  return text
    .replace(new RegExp(`\\b${name}\\s+${y}\\b`, 'gi'), '{month} {year}')
    .replace(new RegExp(`\\b${name.slice(0, 3)}\\.?\\s+${y}\\b`, 'gi'), '{month_short} {year}');
}

export function describeSchedule(rule: Pick<RecurringRule, 'interval' | 'endDate' | 'maxCount'>): string {
  const every = { monthly: 'Every month', quarterly: 'Every 3 months', yearly: 'Every year' }[rule.interval];
  if (rule.maxCount) return `${every}, ${rule.maxCount} times`;
  if (rule.endDate) return `${every} until ${rule.endDate}`;
  return every;
}
