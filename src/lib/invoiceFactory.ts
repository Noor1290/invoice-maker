import type { AppSettings, Invoice, LineItem, NumberSequence, PartySnapshot, SellerSnapshot } from '@/db/types';
import { addDays, nowIso, todayIso, uid } from './utils';

export function emptyParty(): PartySnapshot {
  return { name: '', address: '', brn: '', vatNo: '', attention: '', email: '', phone: '' };
}

export function sellerFromSettings(settings: AppSettings): SellerSnapshot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { logo: _logo, hideLogo: _hide, ...rest } = settings.company;
  return structuredClone(rest);
}

export function newLine(_settings?: Pick<AppSettings, 'defaults'>, partial: Partial<LineItem> = {}): LineItem {
  return {
    id: uid(),
    description: '',
    qty: 1,
    unitPrice: 0,
    discountPct: 0,
    noVat: false,
    ...partial,
  };
}

/** A fresh draft with smart defaults. `number` is the suggested next number (not yet reserved). */
export function newInvoice(settings: AppSettings, seq: NumberSequence, number: string): Invoice {
  const issueDate = todayIso();
  const now = nowIso();
  return {
    id: uid(),
    docType: seq.docType,
    sequenceId: seq.id,
    number,
    status: 'draft',
    issueDate,
    dueDate: addDays(issueDate, settings.defaults.termsDays),
    termsDays: settings.defaults.termsDays,
    currency: settings.defaults.currency,
    vatRate: settings.defaults.vatRate,
    seller: sellerFromSettings(settings),
    client: emptyParty(),
    lines: [newLine(settings)],
    notes: settings.defaults.notes,
    templateId: settings.defaults.templateId,
    payments: [],
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}
