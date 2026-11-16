import { describe, expect, it } from 'vitest';
import {
  formatSequenceNumber,
  incrementInvoiceNumber,
  looseKey,
  matchSequenceValue,
  normalizeNumber,
  parseInvoiceNumber,
  resolveTokens,
  sequenceFromExample,
  skipRange,
  upcomingNumbers,
} from './numbering';
import type { NumberSequence } from '@/db/types';

describe('Acceptance 3: next numbers', () => {
  it.each([
    ['00012', '00013'],
    ['PSINV1245', 'PSINV1246'],
    ['421', '422'],
    ['PSINV0999', 'PSINV1000'],
    ['INV-2026-0009', 'INV-2026-0010'],
    ['99', '100'],
    ['INV-0042/A', 'INV-0043/A'],
  ])('%s → %s', (from, to) => {
    expect(incrementInvoiceNumber(from)).toBe(to);
  });

  it('returns null when there are no digits to count', () => {
    expect(incrementInvoiceNumber('ABC')).toBeNull();
  });
});

describe('parseInvoiceNumber', () => {
  it('splits at the last run of digits and keeps leading zeros', () => {
    expect(parseInvoiceNumber('INV-2026-0001')).toEqual({ prefix: 'INV-2026-', digits: '0001', value: 1, suffix: '' });
    expect(parseInvoiceNumber('  00012 ')).toEqual({ prefix: '', digits: '00012', value: 12, suffix: '' });
  });
});

describe('sequences', () => {
  const seq: NumberSequence = {
    id: 's',
    name: 'Standard',
    docType: 'invoice',
    mode: 'auto',
    ...sequenceFromExample('PSINV1245')!,
  };

  it('Acceptance 2 (format part): PSINV1245 → PSINV1245, PSINV1246, PSINV1247', () => {
    expect(upcomingNumbers(seq, 3)).toEqual(['PSINV1245', 'PSINV1246', 'PSINV1247']);
  });

  it('supports date tokens', () => {
    const s = { prefix: 'INV-{YYYY}-{MM}-', suffix: '/{YY}', minDigits: 4 };
    expect(formatSequenceNumber(s, 9, '2026-03-05')).toBe('INV-2026-03-0009/26');
    expect(resolveTokens('{YYYY}{YY}{MM}', '2027-12-01')).toBe('20272712');
  });

  it('recognises numbers belonging to a sequence (case-insensitive)', () => {
    expect(matchSequenceValue(seq, ' psinv1300 ')).toBe(1300);
    expect(matchSequenceValue(seq, 'CN-0001')).toBeNull();
  });

  it('describes skipped ranges', () => {
    const plain = { prefix: '', suffix: '', minDigits: 3 };
    expect(skipRange(plain, 422, 500)?.label).toBe('Numbers 422–499 will be skipped');
    expect(skipRange(plain, 422, 423)?.label).toBe('Number 422 will be skipped');
    expect(skipRange(plain, 422, 422)).toBeNull();
  });
});

describe('comparison keys', () => {
  it('normalises case and surrounding spaces only', () => {
    expect(normalizeNumber('  PSINV1245 ')).toBe('psinv1245');
    expect(normalizeNumber('00012')).not.toBe(normalizeNumber('12'));
  });
  it('loose key catches near-matches', () => {
    expect(looseKey('00012')).toBe(looseKey('12'));
    expect(looseKey('PSINV-1245')).toBe(looseKey('psinv1245'));
    expect(looseKey('PSINV1245')).not.toBe(looseKey('PSINV1246'));
  });
});
