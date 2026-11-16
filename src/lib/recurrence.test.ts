import { describe, expect, it } from 'vitest';
import { applyPlaceholders, dueDates, occurrence, suggestPlaceholders } from './recurrence';
import type { RecurringRule } from '@/db/types';

const rule = (o: Partial<RecurringRule>) =>
  ({
    startDate: '2026-01-31',
    interval: 'monthly',
    nextRunDate: '2026-01-31',
    createdCount: 0,
    status: 'active',
    generated: [],
    ...o,
  }) as RecurringRule;

describe('occurrences', () => {
  it('monthly keeps the day of the month (31st → end of shorter months)', () => {
    expect([0, 1, 2, 3].map((n) => occurrence('2026-01-31', 'monthly', n))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('quarterly and yearly, including leap days', () => {
    expect([0, 1, 2, 3, 4].map((n) => occurrence('2026-11-30', 'quarterly', n))).toEqual(['2026-11-30', '2027-02-28', '2027-05-30', '2027-08-30', '2027-11-30']);
    expect([0, 1, 4].map((n) => occurrence('2028-02-29', 'yearly', n))).toEqual(['2028-02-29', '2029-02-28', '2032-02-29']);
  });
});

describe('due dates', () => {
  it('returns every missed date, oldest first', () => {
    expect(dueDates(rule({ startDate: '2026-08-01', nextRunDate: '2026-08-01' }), '2026-11-16')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  });
  it('nothing before the next date, nothing when paused or stopped', () => {
    expect(dueDates(rule({ nextRunDate: '2026-12-01', startDate: '2026-12-01' }), '2026-11-16')).toEqual([]);
    expect(dueDates(rule({ status: 'paused', startDate: '2026-08-01', nextRunDate: '2026-08-01' }), '2026-11-16')).toEqual([]);
    expect(dueDates(rule({ status: 'stopped', startDate: '2026-08-01', nextRunDate: '2026-08-01' }), '2026-11-16')).toEqual([]);
  });
  it('respects the end date and the number of times', () => {
    expect(dueDates(rule({ startDate: '2026-08-01', nextRunDate: '2026-08-01', endDate: '2026-09-30' }), '2026-11-16')).toEqual(['2026-08-01', '2026-09-01']);
    expect(dueDates(rule({ startDate: '2026-08-01', nextRunDate: '2026-08-01', maxCount: 3 }), '2026-11-16')).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(dueDates(rule({ startDate: '2026-08-01', nextRunDate: '2026-10-01', maxCount: 3, createdCount: 2 }), '2026-11-16')).toEqual(['2026-10-01']);
  });
  it('never returns a date that was already created', () => {
    const r = rule({ startDate: '2026-08-01', nextRunDate: '2026-08-01', generated: [{ date: '2026-08-01', invoiceId: 'x', number: 'A' }] });
    expect(dueDates(r, '2026-09-15')).toEqual(['2026-09-01']);
  });
});

describe('placeholders', () => {
  it('fills {month} {year} for the invoice date', () => {
    expect(applyPlaceholders('Bookkeeping – {month} {year}', '2026-11-01')).toBe('Bookkeeping – November 2026');
    expect(applyPlaceholders('{month_short}-{year} ({quarter})', '2027-02-28')).toBe('Feb-2027 (Q1)');
  });
  it('suggests placeholders from the source invoice month', () => {
    expect(suggestPlaceholders('Monthly bookkeeping – October 2026', '2026-10-31')).toBe('Monthly bookkeeping – {month} {year}');
    expect(suggestPlaceholders('Retainer Oct 2026', '2026-10-05')).toBe('Retainer {month_short} {year}');
    expect(suggestPlaceholders('Retainer September 2026', '2026-10-05')).toBe('Retainer September 2026');
  });
});
