import { toCents } from './money';

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function underThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(`${ONES[h]} hundred`);
  if (rest) {
    const words = rest < 20 ? ONES[rest] : TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : '');
    parts.push(h ? `and ${words}` : words);
  }
  return parts.join(' ');
}

/** 30272 → "thirty thousand two hundred and seventy-two" (British English). */
export function integerToWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    let w = underThousand(g);
    // "one thousand and five": add "and" before a final group below 100
    if (i === 0 && groups.length > 1 && g < 100) w = `and ${w}`;
    words.push(SCALES[i] ? `${w} ${SCALES[i]}` : w);
  }
  return words.join(' ');
}

const UNITS: Record<string, [string, string, string, string]> = {
  // [major singular, major plural, minor singular, minor plural]
  MUR: ['rupee', 'rupees', 'cent', 'cents'],
  INR: ['rupee', 'rupees', 'paisa', 'paise'],
  USD: ['dollar', 'dollars', 'cent', 'cents'],
  AUD: ['dollar', 'dollars', 'cent', 'cents'],
  CAD: ['dollar', 'dollars', 'cent', 'cents'],
  SGD: ['dollar', 'dollars', 'cent', 'cents'],
  EUR: ['euro', 'euros', 'cent', 'cents'],
  GBP: ['pound', 'pounds', 'penny', 'pence'],
  ZAR: ['rand', 'rand', 'cent', 'cents'],
  CHF: ['franc', 'francs', 'centime', 'centimes'],
  AED: ['dirham', 'dirhams', 'fils', 'fils'],
  KES: ['shilling', 'shillings', 'cent', 'cents'],
  MGA: ['ariary', 'ariary', 'iraimbilanja', 'iraimbilanja'],
};

/** "Thirty thousand two hundred and seventy-two rupees only" */
export function amountInWords(amount: number, currency: string): string {
  const cents = Math.abs(toCents(amount));
  const major = Math.floor(cents / 100);
  const minor = cents % 100;
  const u = UNITS[currency.toUpperCase()] ?? [currency.toUpperCase(), currency.toUpperCase(), 'cent', 'cents'];
  let s = `${integerToWords(major)} ${major === 1 ? u[0] : u[1]}`;
  if (minor) s += ` and ${integerToWords(minor)} ${minor === 1 ? u[2] : u[3]}`;
  s += ' only';
  if (toCents(amount) < 0) s = `minus ${s}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
