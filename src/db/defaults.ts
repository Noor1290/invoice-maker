import type { AppSettings, CompanyProfile, NumberSequence } from './types';
import { nowIso } from '@/lib/utils';

export const STANDARD_SEQUENCE_ID = 'seq-standard';
export const CREDIT_NOTE_SEQUENCE_ID = 'seq-credit-note';
export const DEFAULT_TEMPLATE_ID = 'classic';

export const DEFAULT_COMPANY: CompanyProfile = {
  name: '',
  tagline: '',
  address: '',
  brn: '',
  vatNo: '',
  phone: '',
  email: '',
  website: '',
  bank: { bankName: '', accountName: '', accountNo: '', iban: '', swift: '' },
};

export const DEFAULT_NOTES =
  'Payment is due within 30 days of the invoice date. Please quote the invoice number as your payment reference.';

export function defaultSequences(): NumberSequence[] {
  return [
    {
      id: STANDARD_SEQUENCE_ID,
      name: 'Standard invoices',
      docType: 'invoice',
      mode: 'auto',
      prefix: 'INV-',
      nextNumber: 1,
      minDigits: 4,
      suffix: '',
    },
    {
      id: CREDIT_NOTE_SEQUENCE_ID,
      name: 'Credit notes',
      docType: 'credit_note',
      mode: 'auto',
      prefix: 'CN-',
      nextNumber: 1,
      minDigits: 4,
      suffix: '',
    },
  ];
}

export function defaultSettings(): AppSettings {
  const now = nowIso();
  return {
    key: 'app',
    company: structuredClone(DEFAULT_COMPANY),
    defaults: {
      currency: 'MUR',
      vatRate: 15,
      termsDays: 30,
      notes: DEFAULT_NOTES,
      templateId: DEFAULT_TEMPLATE_ID,
    },
    sequences: defaultSequences(),
    defaultSequenceId: STANDARD_SEQUENCE_ID,
    onboarded: false,
    storageNoticeSeen: false,
    createdAt: now,
    updatedAt: now,
  };
}
