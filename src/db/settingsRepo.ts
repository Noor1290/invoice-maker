import { db } from './db';
import { defaultSettings, STANDARD_SEQUENCE_ID } from './defaults';
import type { AppSettings, CompanyProfile, NumberSequence } from './types';
import {
  describeSkip,
  formatSequenceNumber,
  sequenceFromExample,
  skipRange,
  validateSequenceFormat,
} from '@/lib/numbering';
import { nowIso, uid } from '@/lib/utils';

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? defaultSettings();
}

/** First run: no invoices and no numbering settings saved yet. */
export async function needsOnboarding(): Promise<boolean> {
  const [settings, invoiceCount] = await Promise.all([db.settings.get('app'), db.invoices.count()]);
  return invoiceCount === 0 && !settings?.onboarded;
}

export interface OnboardingInput {
  firstNumber: string;
  company?: Partial<CompanyProfile>;
}

export async function completeOnboarding({ firstNumber, company }: OnboardingInput): Promise<AppSettings> {
  const fmt = sequenceFromExample(firstNumber);
  if (!fmt) throw new Error('Include at least one digit so the app can count up, e.g. INV-001.');

  return db.transaction('rw', db.settings, db.numberingLog, async () => {
    const settings = (await db.settings.get('app')) ?? defaultSettings();
    settings.sequences = settings.sequences.map((s) =>
      s.id === STANDARD_SEQUENCE_ID ? { ...s, ...fmt, mode: 'auto' as const } : s,
    );
    if (company) {
      settings.company = {
        ...settings.company,
        ...company,
        bank: { ...settings.company.bank, ...(company.bank ?? {}) },
      };
    }
    settings.onboarded = true;
    settings.updatedAt = nowIso();
    await db.settings.put(settings);
    await db.numberingLog.add({
      at: nowIso(),
      sequenceId: STANDARD_SEQUENCE_ID,
      type: 'sequence_created',
      to: firstNumber.trim(),
      detail: `Numbering starts at ${firstNumber.trim()}`,
    });
    return settings;
  });
}

export async function updateSettings(patch: (s: AppSettings) => void): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const settings = await getSettings();
    patch(settings);
    settings.updatedAt = nowIso();
    await db.settings.put(settings);
    return settings;
  });
}

/**
 * Save changes to a numbering sequence. Moving the counter forward records the
 * skipped range (with the optional reason) in the numbering log.
 */
export async function saveSequence(next: NumberSequence, reason?: string): Promise<AppSettings> {
  const error = validateSequenceFormat(next);
  if (error) throw new Error(error);

  return db.transaction('rw', db.settings, db.numberingLog, async () => {
    const settings = await getSettings();
    const idx = settings.sequences.findIndex((s) => s.id === next.id);
    const prev = idx >= 0 ? settings.sequences[idx] : undefined;

    if (!prev) {
      settings.sequences.push(next);
      await db.numberingLog.add({
        at: nowIso(),
        sequenceId: next.id,
        type: 'sequence_created',
        to: formatSequenceNumber(next, next.nextNumber),
        detail: `Sequence "${next.name}" created`,
      });
    } else {
      settings.sequences[idx] = next;
      const formatChanged =
        prev.prefix !== next.prefix || prev.suffix !== next.suffix || prev.minDigits !== next.minDigits;
      if (next.nextNumber > prev.nextNumber && !formatChanged) {
        const range = skipRange(next, prev.nextNumber, next.nextNumber);
        await db.numberingLog.add({
          at: nowIso(),
          sequenceId: next.id,
          type: 'skip',
          from: range?.first,
          to: range?.last,
          reason: reason?.trim() || undefined,
          detail: range ? `${describeSkip(range)} skipped; next number set to ${formatSequenceNumber(next, next.nextNumber)}` : undefined,
        });
      } else if (next.nextNumber !== prev.nextNumber || formatChanged) {
        await db.numberingLog.add({
          at: nowIso(),
          sequenceId: next.id,
          type: 'jump',
          from: formatSequenceNumber(prev, prev.nextNumber),
          to: formatSequenceNumber(next, next.nextNumber),
          reason: reason?.trim() || undefined,
          detail: `Next number changed from ${formatSequenceNumber(prev, prev.nextNumber)} to ${formatSequenceNumber(next, next.nextNumber)}`,
        });
      }
    }
    settings.updatedAt = nowIso();
    await db.settings.put(settings);
    return settings;
  });
}

export function newSequence(partial: Partial<NumberSequence> = {}): NumberSequence {
  return {
    id: `seq-${uid().slice(0, 8)}`,
    name: 'New sequence',
    docType: 'invoice',
    mode: 'auto',
    prefix: '',
    nextNumber: 1,
    minDigits: 4,
    suffix: '',
    ...partial,
  };
}

export async function deleteSequence(id: string): Promise<void> {
  await db.transaction('rw', db.settings, db.invoices, async () => {
    const used = await db.invoices.where('sequenceId').equals(id).count();
    if (used > 0) throw new Error('This sequence is used by existing invoices and cannot be deleted.');
    const settings = await getSettings();
    if (settings.defaultSequenceId === id) throw new Error('You cannot delete the default sequence.');
    settings.sequences = settings.sequences.filter((s) => s.id !== id);
    await db.settings.put(settings);
  });
}
